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
} = require("../../../roles/aggency/bid/bidRepository");
const { findUserById } = require("../../admin/usersManagement/usersRepository");
const { runInBackground } = require("@helperUtils/runInBackground");

// Application locations are represented as [latitude, longitude].
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

    const bidder = await findUserById(JobBid.user);
    const isNurse = bidder?.accountState?.userType === "nurse";

    if (!isNurse) {
      /*
       * Agency bid: stop here - the agency still has to pick a worker via
       * createBooking. The shift was already closed by the claim above.
       */
      const updatedBid = await findBidById_(JobBid._id);
      return { updatedBid, booking: null, isNurse: false };
    }

    // Direct nurse bid: same-day conflict check, then book immediately
    const conflict = await BookingRepo.findConflictingBooking(
      JobBid.user,
      JobBid.shift,
    );
    if (conflict) {
      await findBidByIdAndUpdate(JobBid._id, { status: "rejected" });

      // The nurse cannot work it after all, so give the shift back.
      await JobRepo.updateShiftStatus(
        JobBid.job.toString(),
        JobBid.shift._id.toString(),
        "pending",
      );

      return { error: "Bid_rejected_due_to_nurse_unavailability" };
    }

    const booking = await BookingService.createBooking({
      bid: JobBid._id,
      worker: JobBid.user,
      createdByUserType: "nurse", // forces resolveInitialBookingStatus -> "active"
      createdByUserId: JobBid.user,
    });

    if (booking?.error) {
      await findBidByIdAndUpdate(JobBid._id, { status: "pending" });

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
    });
    return {
      Jobs: distanceOrigin
        ? Jobs.map((job) => addDistanceFromOrigin(job, distanceOrigin))
        : Jobs,
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
  });
  const formatedJobs = Jobs.map((job) =>
    addDistanceFromOrigin(formatJobToTimezone(job, timezone), distanceOrigin),
  );

  return { Jobs: formatedJobs, meta };
};

const updateJob = async (id, data) => {
  const Job = await JobRepo.findJobById_(id);

  if (!Job) {
    return { error: "Job_not_found" };
  }

  const allowedFields = [
    "name",
    "description",
    "type",
    "gender",
    "status",
    "shift",
    "location",
    "notes",
    "instructions",
    "contactDetails",
    "emergencyContact",
    "documents",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }
  console.log("updateData", updateData);

  if (Object.keys(updateData).length === 0) {
    return Job;
  }

  Object.assign(Job, updateData);
  await Job.save();

  return Job;
};

const getJobDetails = async (id, timezone) => {
  const Job = await JobRepo.findJobById(id);

  if (!Job) {
    return null;
  }

  return formatJobToTimezone(Job, timezone);
};
const deleteJob = async (id) => {
  if (!id) throw new Error("Job ID is required");

  const deleted = await JobRepo.deleteJob(id);
  return !!deleted;
};

module.exports = {
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobBids,
  getJobDetails,
  updateJobBidStatus,
};
