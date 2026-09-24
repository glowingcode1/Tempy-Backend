const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const JobRepo = require("./jobRepository");
const BookingRepo = require("../booking/bookingRepository");
const BookingService = require("../booking/bookingService");

const formatJobToTimezone = require("./formator/formatJobToTimezone");
const {
  getBidByJob,
  findBidById_,
  updateBidStatuses,
  // bidRepository exports this as findByIdAndUpdate; importing it under the
  // old name left it undefined and every bid reject / withdraw threw.
  findByIdAndUpdate: findBidByIdAndUpdate,
  findBidById,
  syncPendingBidShift,
  deletePendingBidsForShifts,
  closeOpenBidsForJob,
} = require("../../../roles/aggency/bid/bidRepository");
const { findUserById } = require("../../admin/usersManagement/usersRepository");
const { runInBackground } = require("@helperUtils/runInBackground");
const {
  getReviewsForObjects,
} = require("../../../commonModules/reviews/reviewRepository");
const moment = require("moment-timezone");

// Application locations are represented as [latitude, longitude].
/*
 * A job's reviews are its customer's reviews of the job's bookings. Only jobs
 * flagged isReviewed are looked up, in one query for the whole page.
 */
const withJobReviews = async (jobs) => {
  const reviewedJobIds = jobs.filter((job) => job.isReviewed).map((job) => job._id);

  const bookings = reviewedJobIds.length
    ? await BookingRepo.findReviewedBookingsByJobs(reviewedJobIds)
    : [];
  const reviewsByBooking = await getReviewsForObjects({
    objectIds: bookings.map((booking) => booking._id),
    objectType: "Booking",
    limit: 0,
  });

  const reviewsByJob = new Map();
  for (const booking of bookings) {
    const review = reviewsByBooking
      .get(String(booking._id))
      ?.reviews.find(
        (r) => String(r.subject?._id || r.subject) === String(booking.user),
      );
    if (!review) continue;

    const key = String(booking.job);
    reviewsByJob.set(key, [...(reviewsByJob.get(key) || []), review]);
  }

  return jobs.map((job) => ({
    ...job,
    isReviewed: Boolean(job.isReviewed),
    reviews: reviewsByJob.get(String(job._id)) || [],
  }));
};

const addDistanceFromOrigin = (job, origin) => {
  if (!origin || !Array.isArray(job?.location?.coordinates)) return job;

  const [originLat, originLng] = origin.map(Number);
  const [jobLat, jobLng] = job.location.coordinates.map(Number);
  const validCoordinates =
    [originLat, jobLat].every(
      (value) => Number.isFinite(value) && value >= -90 && value <= 90,
    ) &&
    [originLng, jobLng].every(
      (value) => Number.isFinite(value) && value >= -180 && value <= 180,
    );

  if (!validCoordinates) return job;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latDifference = toRadians(jobLat - originLat);
  const lngDifference = toRadians(jobLng - originLng);
  const haversine =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(jobLat)) *
      Math.sin(lngDifference / 2) ** 2;
  const distanceInKM = Number(
    (6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))).toFixed(2),
  );

  return { ...job, distanceInKM };
};

const createJob = async (data, timezone) => {
  const Job = await JobRepo.createJob(data);
  return formatJobToTimezone(Job.toObject(), timezone);
};

const updateJobBidStatus = async (id, status, user) => {
  const JobBid = await findBidById_(id);
  if (!JobBid) return null;

  if (user) {
    const jobCreatorId = String(JobBid.jobCreator || JobBid.user || "");
    if (String(user) !== jobCreatorId) {
      return null;
    }
  }

  if (status === "accepted") {
    /*
     * Only a bid that is still open can be won. Without this a customer could
     * accept one that had been rejected, withdrawn, or released back to the
     * market by the unstaffed-award sweep - resurrecting a dead award and
     * re-rejecting the competitors that had just been reopened.
     */
    if (JobBid.status !== "pending") {
      return { error: "Bid_not_available" };
    }

    const bidder = await findUserById(JobBid.user);
    const isNurse = bidder?.accountState?.userType === "nurse";

    /*
     * A nurse already booked at this time cannot win the shift. Checked before
     * the claim, so the shift and the competing bids stay exactly as they
     * were - only this bid is closed.
     */
    if (
      isNurse &&
      (await BookingRepo.findConflictingBooking(JobBid.user, JobBid.shift))
    ) {
      await findBidByIdAndUpdate(JobBid._id, { status: "rejected" });
      return { error: "Bid_rejected_due_to_nurse_unavailability" };
    }

    /*
     * Claim the shift before touching any bid. This both closes the shift to
     * other suppliers - the agency still has to assign staff, and until it
     * does the shift must not be offered to anyone else - and settles who
     * wins if two accepts land at once.
     */
    const claimed = await JobRepo.claimShiftForAward(
      JobBid.job.toString(),
      JobBid.shift._id.toString(),
    );

    if (!claimed) {
      return { error: "Bid_not_available" };
    }

    // accept this bid, reject the rest for the same shift
    await updateBidStatuses(JobBid._id, "accepted", "rejected");

    if (!isNurse) {
      /*
       * Agency bid: stop here - the agency still has to pick a worker via
       * createBooking. The shift was already closed by the claim above.
       */
      const updatedBid = await findBidById_(JobBid._id);
      return { updatedBid, booking: null, isNurse: false };
    }

    // Direct nurse bid: book immediately
    const booking = await BookingService.createBooking({
      bid: JobBid._id,
      worker: JobBid.user,
      createdByUserType: "nurse", // forces resolveInitialBookingStatus -> "active"
      createdByUserId: JobBid.user,
    });

    if (booking?.error) {
      /*
       * Undo the award in full: this bid and the competitors it just rejected
       * all go back to pending, then the shift returns to the market.
       */
      await updateBidStatuses(JobBid._id, "pending", "pending");

      await JobRepo.updateShiftStatus(
        JobBid.job.toString(),
        JobBid.shift._id.toString(),
        "pending",
      );

      return { error: booking.error };
    }

    const updatedBid = await findBidById_(JobBid._id);
    return { updatedBid, booking, isNurse: true };
  }

  /*
   * Only a live bid can be rejected or withdrawn. Re-rejecting a settled one
   * would run the release below a second time and hand back a shift that
   * somebody else may since have won.
   */
  if (!["pending", "accepted"].includes(JobBid.status)) {
    return { error: "Bid_not_available" };
  }

  // rejected / withdraw — just update the bid
  const updated = await findBidByIdAndUpdate(id, { status });

  /*
   * Undoing an award puts the shift back on the market. If the bid was
   * already staffed the booking owns the shift, and only cancelling the
   * booking may release it.
   */
  if (JobBid.status === "accepted") {
    const booking = await BookingRepo.findBookingByBid(JobBid._id);

    if (!booking) {
      runInBackground(
        JobRepo.updateShiftStatus(
          JobBid.job.toString(),
          JobBid.shift._id.toString(),
          "pending",
        ),
        "release shift after bid " + JobBid._id + " was undone",
      );
    }
  }

  return { updatedBid: updated };
};

const getJobBids = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  job,
  shift,
  user,
  jobCreator,
  dateFilter,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { jobBids, meta } = await getBidByJob({
    timezone,
    page,
    limit,
    keyword,
    status,
    job,
    shift,
    user,
    jobCreator,
    skip,
    dateFilter,
  });
  const formatedJobBids = jobBids.map((jobBid) => {
    return formatJobToTimezone(jobBid, timezone);
  });

  return { jobBids: formatedJobBids, meta };
};

const getJobs = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  userType,
  requester,
  latitude, // user's latitude
  longitude, // user's longitude
  km, // radius in kilometers
  projection,
  summary,
  worker,
  employer,
  dateFilter,
  distanceOrigin,
  dateRange,
  jobRoles,
  sort,
  bids,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  if (summary) {
    const { Jobs, meta } = await JobRepo.getJobsSummary({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      skip,
      userType,
      requester,
      latitude,
      longitude,
      km,
      projection,
      worker,
      employer,
      dateRange,
      jobRoles,
      sort,
      bids,
    });
    const visibleJobs = Jobs.map((job) =>
      hideAlertFromOthers(job, requester, userType === "admin"),
    );
    return {
      Jobs: distanceOrigin
        ? visibleJobs.map((job) => addDistanceFromOrigin(job, distanceOrigin))
        : visibleJobs,
      meta,
    };
  }
  const { Jobs, meta } = await JobRepo.getJobs({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    skip,
    userType,
    requester,
    latitude,
    longitude,
    km,
    worker,
    employer,
    dateFilter,
    dateRange,
    jobRoles,
    sort,
    bids,
  });
  const isAdmin = userType === "admin";
  const formatedJobs = (await withJobReviews(Jobs)).map((job) =>
    addDistanceFromOrigin(
      formatJobToTimezone(
        hideAlertFromOthers(job, requester, isAdmin),
        timezone,
      ),
      distanceOrigin,
    ),
  );

  return { Jobs: formatedJobs, meta };
};

const isJobOwner = (job, requesterId) =>
  String(job.user?._id || job.user) === String(requesterId);

// Changing these on a shift somebody already holds would change their deal.
const SHIFT_TIMING_FIELDS = [
  "date",
  "startTime",
  "endTime",
  "isBreak",
  "breakMin",
];
// Only editable on a pending job nobody has bid on (see updateJob).
const BID_LOCKED_SHIFT_FIELDS = ["date", "startTime", "endTime"];

// A job is pending while none of its shifts has been booked or completed.
const isJobPending = (job) =>
  (job.shift || []).every((shift) => shift.status === "pending");

const SHIFT_EDITABLE_FIELDS = [
  ...SHIFT_TIMING_FIELDS,
  "allowedPersons",
  "isBiddingAllowed",
];

const toShiftDate = (date) => moment.utc(date).format("YYYY-MM-DD");
const toStoredShiftDate = (date) =>
  new Date(`${toShiftDate(date)}T00:00:00.000Z`);

const sameShiftValue = (key, a, b) =>
  key === "date" ? toShiftDate(a) === toShiftDate(b) : String(a) === String(b);

// Shift dates and times are stored in UTC ("YYYY-MM-DD" + "HH:mm").
const shiftStartsInFuture = ({ date, startTime }) => {
  const start = moment.utc(
    `${toShiftDate(date)} ${startTime}`,
    "YYYY-MM-DD HH:mm",
    true,
  );
  return start.isValid() && start.isAfter(moment.utc());
};

/*
 * Turn the submitted shift list into edits against the stored one, instead of
 * replacing the array (which regenerated every shift id and orphaned the bids
 * and bookings pointing at them).
 *
 *   - shift with a known _id -> edit it. Timing can only change while the
 *                               shift is still "pending"; a booked or
 *                               completed shift only takes allowedPersons /
 *                               isBiddingAllowed.
 *   - shift without an _id   -> new shift
 *   - stored shift left out  -> removed, only while it is still "pending"
 *
 * Shift status is never taken from the client.
 */
const planShiftChanges = (existingShifts, incomingShifts) => {
  const existingById = new Map(existingShifts.map((s) => [String(s._id), s]));
  const seen = new Set();
  const shiftEdits = [];
  const addShifts = [];

  for (const incoming of incomingShifts) {
    if (incoming.isBreak && !incoming.breakMin) {
      return { error: "breakMin_required_when_isBreak_true" };
    }

    if (!incoming._id) {
      const shift = {};
      for (const key of SHIFT_EDITABLE_FIELDS) {
        if (incoming[key] !== undefined) shift[key] = incoming[key];
      }
      if (!shift.date || !shift.startTime || !shift.endTime) {
        return { error: "invalid_shift_date_or_time" };
      }
      if (!shiftStartsInFuture(shift)) {
        return { error: "shift_cannot_be_in_the_past" };
      }
      shift.date = toStoredShiftDate(shift.date);
      addShifts.push(shift);
      continue;
    }

    const id = String(incoming._id);
    const existing = existingById.get(id);
    if (!existing) return { error: "Shift_not_found" };
    if (seen.has(id)) return { error: "Duplicate_shift_in_request" };
    seen.add(id);

    const changes = {};
    for (const key of SHIFT_EDITABLE_FIELDS) {
      if (
        incoming[key] !== undefined &&
        !sameShiftValue(key, incoming[key], existing[key])
      ) {
        changes[key] = incoming[key];
      }
    }
    if (!Object.keys(changes).length) continue;

    const timingChanged = SHIFT_TIMING_FIELDS.some((key) => key in changes);

    if (timingChanged) {
      if (existing.status !== "pending") {
        return { error: "Cannot_edit_booked_or_completed_shift" };
      }
      if (!shiftStartsInFuture({ ...existing, ...changes })) {
        return { error: "shift_cannot_be_in_the_past" };
      }
      if (changes.date !== undefined) {
        changes.date = toStoredShiftDate(changes.date);
      }
    }

    shiftEdits.push({
      _id: existing._id,
      changes,
      anyStatus: !timingChanged,
      timingChanged,
    });
  }

  const removeShiftIds = [];
  for (const existing of existingShifts) {
    if (seen.has(String(existing._id))) continue;
    if (existing.status !== "pending") {
      return { error: "Cannot_remove_booked_or_completed_shift" };
    }
    removeShiftIds.push(existing._id);
  }

  if (existingShifts.length - removeShiftIds.length + addShifts.length < 1) {
    return { error: "Job_must_have_at_least_one_shift" };
  }

  return { shiftEdits, addShifts, removeShiftIds };
};

const updateJob = async (id, data, { requesterId, isAdmin, timezone } = {}) => {
  const Job = await JobRepo.findJobById_(id);

  if (!Job || Job.status === "deleted") {
    return null;
  }

  if (!isAdmin && !isJobOwner(Job, requesterId)) {
    return null;
  }

  const allowedFields = [
    "name",
    "description",
    "type",
    "gender",
    "status",
    "location",
    "notes",
    "instructions",
    "contactDetails",
    "emergencyContact",
    "documents",
    "rate",
  ];

  const set = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      set[key] = data[key];
    }
  }

  let plan = { shiftEdits: [], addShifts: [], removeShiftIds: [] };

  if (Array.isArray(data.shift)) {
    plan = planShiftChanges(
      Job.shift.map((s) => s.toObject()),
      data.shift,
    );
    if (plan.error) return { error: plan.error };
  }

  /*
   * The rate and when a shift happens are what suppliers bid against, so
   * they can only change while the job is pending (no shift booked or
   * completed) and unfilled (no standing bid), and only by the job's
   * creator - not an admin acting on its behalf.
   */
  const rateChanged =
    set.rate !== undefined && (set.rate ?? null) !== (Job.rate ?? null);
  if (!rateChanged) delete set.rate;

  const shiftTimeChanged = plan.shiftEdits.some((edit) =>
    BID_LOCKED_SHIFT_FIELDS.some((key) => key in edit.changes),
  );

  if (rateChanged || shiftTimeChanged) {
    if (!isJobOwner(Job, requesterId)) {
      return { error: "Only_job_creator_can_edit_rate_or_shift_time", statusCode: 403 };
    }
    if (!isJobPending(Job)) {
      return { error: "Cannot_edit_rate_or_shift_time_job_not_pending" };
    }
    if (await JobRepo.hasStandingBids(id)) {
      return { error: "Cannot_edit_rate_or_shift_time_job_has_bids" };
    }
  }

  const nothingToDo =
    !Object.keys(set).length &&
    !plan.shiftEdits.length &&
    !plan.addShifts.length &&
    !plan.removeShiftIds.length;

  if (nothingToDo) {
    return formatJobToTimezone(Job.toObject(), timezone);
  }

  const updated = await JobRepo.updateJobAndShifts(id, {
    set,
    shiftEdits: plan.shiftEdits,
    removeShiftIds: plan.removeShiftIds,
    addShifts: plan.addShifts,
  });

  // Open bids must describe the shift as it now is.
  for (const edit of plan.shiftEdits) {
    if (edit.timingChanged) {
      runInBackground(
        syncPendingBidShift(edit._id, edit.changes),
        "sync bids for edited shift " + edit._id,
      );
    }
  }

  if (plan.removeShiftIds.length) {
    runInBackground(
      deletePendingBidsForShifts(plan.removeShiftIds),
      "close bids for removed shifts of job " + id,
    );
  }

  return formatJobToTimezone(updated, timezone);
};

const getJobDetails = async (id, timezone, { requesterId, isAdmin } = {}) => {
  const Job = await JobRepo.findJobById(id);

  if (!Job) {
    return null;
  }

  const [[withReviews], isFilled] = await Promise.all([
    withJobReviews([Job]),
    JobRepo.hasStandingBids(Job._id),
  ]);

  return formatJobToTimezone(
    {
      ...hideAlertFromOthers(withReviews, requesterId, isAdmin),
      // Filled jobs have their rate and shift times locked.
      isFilled,
      canEditRateAndShiftTimes:
        !isFilled && isJobPending(Job) && isJobOwner(Job, requesterId),
    },
    timezone,
  );
};

// The alert number is the job owner's private contact; suppliers browsing
// the job must not see it.
const hideAlertFromOthers = (job, requesterId, isAdmin) => {
  const { alert, ...rest } = job;
  if (!alert || !(isAdmin || isJobOwner(job, requesterId))) return rest;
  return { ...rest, alert: publicAlert(alert) };
};

// The sent log is bookkeeping for the alert cron, not part of the setting.
const publicAlert = (alert) => {
  const { sent, ...rest } = alert || {};
  return rest;
};

const DEFAULT_ALERT = {
  enabled: false,
  phoneNumber: { code: "", number: "" },
  hoursBefore: 0,
  minutesBefore: 0,
};

/*
 * Saves the job's shift alert. `alert` is merged over what is stored, so the
 * toggle alone can be sent to switch it off. An enabled alert needs a phone
 * number and a lead time above zero.
 */
const updateJobAlert = async (id, alert, { requesterId, isAdmin } = {}) => {
  const job = await JobRepo.findJobById_(id, "user status alert");
  if (!job || job.status === "deleted") return null;
  if (!isAdmin && !isJobOwner(job, requesterId)) return null;

  const current = job.alert?.toObject?.() || DEFAULT_ALERT;
  const next = {
    ...DEFAULT_ALERT,
    ...current,
    ...alert,
    phoneNumber: {
      ...DEFAULT_ALERT.phoneNumber,
      ...current.phoneNumber,
      ...(alert.phoneNumber || {}),
    },
  };

  if (next.enabled) {
    if (!next.phoneNumber.code || !next.phoneNumber.number) {
      return { error: "alert_phone_number_required" };
    }
    if (next.hoursBefore * 60 + next.minutesBefore <= 0) {
      return { error: "alert_time_required" };
    }
  }

  job.alert = next;
  await job.save();
  return publicAlert(job.alert.toObject());
};

const clearJobAlert = async (id, { requesterId, isAdmin } = {}) => {
  const job = await JobRepo.findJobById_(id, "user status alert");
  if (!job || job.status === "deleted") return null;
  if (!isAdmin && !isJobOwner(job, requesterId)) return null;

  job.alert = DEFAULT_ALERT;
  await job.save();
  return publicAlert(job.alert.toObject());
};
const deleteJob = async (id, { requesterId, isAdmin } = {}) => {
  if (!id) throw new Error("Job ID is required");

  const job = await JobRepo.findJobById_(id, "user status name");

  if (!job || job.status === "deleted") return null;
  if (!isAdmin && !isJobOwner(job, requesterId)) return null;

  // Somebody is booked on it: they have to be cancelled first.
  if (await JobRepo.hasLiveBookings(id)) {
    return { error: "Cannot_delete_job_with_active_bookings" };
  }

  const deleted = await JobRepo.deleteJob(id);
  if (!deleted) return null;

  const bidderIds = await closeOpenBidsForJob(id);

  return { name: deleted.name, bidderIds };
};

module.exports = {
  updateJobAlert,
  clearJobAlert,
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobBids,
  getJobDetails,
  updateJobBidStatus,
};
