const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const BookingRepo = require("./bookingRepository");
const { cache, invalidate } = require("@redisCache");
const formatBookingToTimezone = require("./formator/formatBookingToTimezone");
const {
  findBidById_,
  updateBidStatuses,
} = require("../../../roles/aggency/bid/bidRepository");
const {
  findUserById,
} = require("../../../roles/admin/usersManagement/usersRepository");
const {
  getActiveJobRoles,
} = require("../../../roles/admin/jobRole/jobRoleRepository");
const convertToMongoArray = require("@helperUtils/convertToMongoArray");
const {
  formatCalendar,
  formatShiftPlan,
} = require("./formator/calendarFormatter");
const {
  updateShiftStatus,
  completeJobIfAllShiftsDone,
  findJobById_,
} = require("../job/jobRepository");
const { runInBackground } = require("@helperUtils/runInBackground");
const { formatAttendance } = require("./formator/formatAttendance");
const {
  getStaffIdsByUser,
  findStaffByUserAndStaff,
} = require("../../../roles/aggency/staff/staffRepository");
const { customerTypes, supplierTypes } = require("@UsersModel");
const { resolveInitialBookingStatus } = require("./bookingStatusHelper");
const {
  getReviewsForObjects,
} = require("../../../commonModules/reviews/reviewRepository");
const platformFee = Number(process.env.PLATFORM_FEE);
// weither Data
const WEATHER_API_URL = process.env.WEATHER_API_URL;
const DAILY =
  "weather_code,sunrise,sunset,uv_index_clear_sky_max,uv_index_max,temperature_2m_mean,relative_humidity_2m_max,relative_humidity_2m_min,wet_bulb_temperature_2m_mean";
const CURRENT = "temperature_2m,is_day,rain,showers,snowfall";
const toISODate = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) throw new Error(`Invalid date: ${v}`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const getWeather = async ({
  latitude,
  longitude,
  startDate,
  endDate,
  timezone = "auto",
}) => {
  const DEFAULT = { daily: {}, current: {} };

  if (!latitude || !longitude) return DEFAULT;

  try {
    const params = new URLSearchParams({
      latitude,
      longitude,
      timezone,
      daily: DAILY,
      current: CURRENT,
      start_date: toISODate(startDate),
      end_date: toISODate(endDate),
    });

    const res = await fetch(`${process.env.WEATHER_API_URL}?${params}`);
    const data = await res.json();

    if (!res.ok) return DEFAULT;

    return data;
  } catch {
    return DEFAULT;
  }
};

const calculatePayment = (
  startTime,
  endTime,
  amount,
  breakMin,
  platformFee,
) => {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  let start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;

  // Handle overnight shifts (e.g. 22:00 -> 06:00)
  if (end < start) {
    end += 24 * 60;
  }
  const platformAmount = amount * platformFee;
  const totalMinutes = end - start - breakMin;
  const totalHours = totalMinutes / 60;
  const perHourRate = (amount - platformAmount) / totalHours;

  return {
    totalHours: +totalHours.toFixed(2),
    perHourRate: +perHourRate.toFixed(2),
    platformAmount: +platformAmount.toFixed(2),
  };
};

const createBooking = async (data) => {
  const bid = await findBidById_(data.bid);

  if (!bid) {
    return { error: "Bid_not_found" };
  }

  if (bid.status !== "accepted") {
    return { error: "Bid_not_available" };
  }

  const bidder = await findUserById(bid.user);

  if (!bidder) {
    return { error: "User_not_found" };
  }

  const bidderUserType = bidder.accountState?.userType || bidder.userType;

  const bidderIsNurse = bidderUserType === "nurse";

  /*
  |--------------------------------------------------------------------------
  | FLOW 1: DIRECT NURSE BID
  |--------------------------------------------------------------------------
  |
  | Care Home accepts a bid submitted directly by a nurse.
  |
  | Bidder:
  |   bid.user = nurse
  |
  | Booking:
  |   worker   = nurse
  |   employer = null
  |   status   = active
  |
  | The nurse does NOT need to accept the booking again.
  |
  |--------------------------------------------------------------------------
  */

  if (bidderIsNurse) {
    // The nurse who submitted the bid becomes the worker.
    const workerId = bid.user;

    // Prevent duplicate/conflicting bookings.
    const conflictingBooking = await BookingRepo.findConflictingBooking(
      workerId,
      bid.shift,
    );

    if (conflictingBooking) {
      return {
        error: "Worker_already_assigned_during_this_time",
      };
    }

    const payment = calculatePayment(
      bid.shift.startTime,
      bid.shift.endTime,
      bid.bid,
      bid.shift.breakMin,
      platformFee,
    );

    const bookingData = {
      bid: bid._id,

      // Care home / customer who owns the job
      user: bid.jobCreator,

      // Direct nurse
      worker: workerId,

      // No agency involved
      employer: null,

      branch: bid.snapshot?.branch || null,

      // Job snapshot
      snapshot: bid.snapshot,

      /*
       * Nurse bid was accepted directly by the care home.
       * Therefore booking is immediately active.
       */
      status: "active",

      shift: {
        _id: bid.shift._id,
        date: bid.shift.date,
        startTime: bid.shift.startTime,
        endTime: bid.shift.endTime,
        isBreak: bid.shift.isBreak,
        breakMin: bid.shift.breakMin,
      },

      job: bid.job,

      payment: {
        amount: bid.bid,
        perHour: payment.perHourRate,
        totalHours: payment.totalHours,
        platformFee: payment.platformAmount,
        totalAmount: +(bid.bid - payment.platformAmount).toFixed(2),

        // Keep these ready for future payment processing.
        amountPayedToWorker: 0,
        amountPayedToEmployer: 0,
        status: "pending",
      },
    };

    const booking = await BookingRepo.createBooking(bookingData);

    if (!booking) {
      return {
        error: "Booking_creation_failed",
      };
    }

    /*
     * Mark the shift as booked.
     */
    runInBackground(
      updateShiftStatus(
        booking.job.toString(),
        booking.shift._id.toString(),
        "booked",
      ),
      "book shift for booking " + booking._id,
    );

    /*
     * The bid is already accepted.
     */
    runInBackground(
      updateBidStatuses(bid._id, "accepted"),
      "settle bids for booking " + booking._id,
    );

    return booking;
  }

  /*
  |--------------------------------------------------------------------------
  | FLOW 2: AGENCY BID
  |--------------------------------------------------------------------------
  |
  | Care Home accepts an agency's bid.
  |
  | The agency must subsequently assign one of its staff members.
  |
  |--------------------------------------------------------------------------
  */

  if (!data.worker) {
    return {
      error: "worker_required_to_assign_staff",
    };
  }

  /*
   * Make sure the selected worker belongs to the agency.
   */
  const staffRecord = await findStaffByUserAndStaff(bid.user, data.worker);

  if (!staffRecord || staffRecord.status !== "active") {
    return {
      error: "worker_not_active_staff_of_this_supplier",
    };
  }

  /*
   * Only the agency which owns the accepted bid can assign
   * one of its workers.
   */
  if (
    data.createdByUserId &&
    String(bid.user) !== String(data.createdByUserId)
  ) {
    return {
      error: "Unauthorized_to_assign_staff_for_this_bid",
    };
  }

  /*
   * Prevent overlapping bookings for the selected worker.
   */
  const conflictingBooking = await BookingRepo.findConflictingBooking(
    data.worker,
    bid.shift,
  );

  if (conflictingBooking) {
    return {
      error: "Worker_already_assigned_during_this_time",
    };
  }

  const payment = calculatePayment(
    bid.shift.startTime,
    bid.shift.endTime,
    bid.bid,
    bid.shift.breakMin,
    platformFee,
  );

  const bookingData = {
    ...data,

    bid: bid._id,

    // Care home
    user: bid.jobCreator,

    // Assigned staff
    worker: data.worker,

    // Agency
    employer: bid.user,

    branch: bid.snapshot?.branch || null,

    snapshot: bid.snapshot,

    /*
     * Agency assigned a worker.
     * Worker still needs to accept.
     */
    status: "pending",

    shift: {
      _id: bid.shift._id,
      date: bid.shift.date,
      startTime: bid.shift.startTime,
      endTime: bid.shift.endTime,
      isBreak: bid.shift.isBreak,
      breakMin: bid.shift.breakMin,
    },

    job: bid.job,

    payment: {
      amount: bid.bid,
      perHour: payment.perHourRate,
      totalHours: payment.totalHours,
      platformFee: payment.platformAmount,
      totalAmount: +(bid.bid - payment.platformAmount).toFixed(2),

      amountPayedToWorker: 0,
      amountPayedToEmployer: 0,
      status: "pending",
    },
  };

  const booking = await BookingRepo.createBooking(bookingData);

  if (!booking) {
    return {
      error: "Booking_creation_failed",
    };
  }

  /*
   * The shift is considered booked because a worker
   * has been assigned.
   */
  runInBackground(
    updateShiftStatus(
      booking.job.toString(),
      booking.shift._id.toString(),
      "booked",
    ),
    "book shift for booking " + booking._id,
  );

  runInBackground(
    updateBidStatuses(bid._id, "accepted"),
    "settle bids for booking " + booking._id,
  );

  return booking;
};

const getBooking = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  worker,
  employer,
  latitude,
  longitude,
  km,
  currentUserId,
  customer,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { booking, meta } = await BookingRepo.getBooking({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    worker,
    employer,
    skip,
    latitude,
    longitude,
    km,
    // The customer has no booking until the assigned worker accepts it.
    hideUnacceptedAssignments: Boolean(customer),
  });
  // One aggregation for the whole page instead of two per row.
  const reviewsByBooking = await getReviewsForObjects({
    objectIds: booking.map((b) => b._id),
    objectType: "Booking",
    currentUserId,
    limit: 0,
  });

  const formatedBooking = booking.map((job) => ({
    ...formatBookingToTimezone(job, timezone),
    ...bookingReviewFields(
      job,
      reviewsByBooking.get(String(job._id)),
      currentUserId,
    ),
  }));

  return { Booking: formatedBooking, meta };
};

/*
 * A booking is only really a booking once the assigned staff member has
 * accepted it ("active"). Up to that point it is an assignment the supplier
 * made and the worker may still decline.
 */
const CANCELLABLE_STATUSES = ["pending", "active"];

const updateBooking = async (id, data) => {
  const Booking = await BookingRepo.findBookingById_(id);

  if (!Booking) {
    return { error: "Booking_not_found" };
  }
  const CANCEL_STATUS = {
    customer: "cancelledByUser",
    nurse: "cancelledByWorker",
    supplier: "cancelledByEmployer",
  };

  // Needed after the save, by which point Booking.status is the new one.
  const previousStatus = Booking.status;

  if (data.customer) {
    if (!data.currentUser.equals(Booking.user)) {
      return { error: "Unauthorized_to_update_booking" };
    }
  } else if (data.supplier) {
    const owner = data.userType === "nurse" ? Booking.worker : Booking.employer;
    if (!data.currentUser.equals(owner)) {
      return { error: "Unauthorized_to_update_booking" };
    }
  }
  // only nurses can activate
  if (data.status === "active" && data.userType !== "nurse") {
    return { error: "Cannot_update_booking_to_active" };
  }
  if (
    Booking.status === "completed" ||
    Booking.status === "cancelledByWorker" ||
    Booking.status === "cancelledByEmployer" ||
    Booking.status === "cancelledByUser"
  ) {
    return { error: "Cannot_update_completed_or_cancelled_booking" };
  }

  if (data.status === "cancel") {
    /*
     * "active" is cancellable too: that is an accepted booking, and
     * cancelling one has to be possible for the job to go back on the
     * market. A booking the worker has already checked in on is not.
     */
    if (!CANCELLABLE_STATUSES.includes(Booking.status)) {
      return { error: "Cannot_cancel_non_pending_booking" };
    }
    data.status = data.customer
      ? CANCEL_STATUS.customer
      : CANCEL_STATUS[data.userType === "nurse" ? "nurse" : "supplier"];
  }

  if (
    Booking.shift.date <
    getCurrentDateInTimezone({ timezone: "UTC", isDateOnly: true })
  ) {
    return { error: "Cannot_update_past_booking" };
  }

  const allowedFields = ["status"];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Booking;
  }

  Object.assign(Booking, updateData);
  await Booking.save();
  const shiftID = Booking.shift._id.toString();
  const jobId = Booking.job.toString();
  const bidID = Booking.bid.toString();
  if (Object.values(CANCEL_STATUS).includes(data.status)) {
    /*
     * Undoing an assignment nobody had accepted yet is not a cancelled
     * booking - whether the worker declined it or the supplier withdrew it,
     * the supplier still holds the winning bid and is expected to assign
     * somebody else. That is what the "Please assign someone else"
     * notification in bookingController tells it to do. Releasing the shift
     * here would hand the job back to the open market and let a competing
     * supplier take work this one had already won.
     *
     * A cancellation by the customer, or of a booking the worker had already
     * accepted, does release it: the bid is closed, competing bids go back to
     * pending and the shift is offered again.
     */
    const assignmentUndone =
      previousStatus === "pending" &&
      (data.status === CANCEL_STATUS.nurse ||
        data.status === CANCEL_STATUS.supplier);

    if (!assignmentUndone) {
      runInBackground(
        updateBidStatuses(bidID, data.status, "pending"),
        "reopen bids for cancelled booking " + id,
      );

      runInBackground(
        updateShiftStatus(jobId, shiftID, "pending"),
        "release shift for cancelled booking " + id,
      );
    }
  }

  return Booking;
};

/*
 * Only the customer, the worker and the supplier on a booking may read it.
 * Admin callers pass isAdmin and skip the check.
 */
const isBookingParty = (booking, userId) =>
  [booking.user, booking.worker, booking.employer].some(
    (party) => party && String(party._id || party) === String(userId),
  );

const isReviewBy = (userId) => (review) =>
  String(review.subject?._id || review.subject) === String(userId);

/*
 * Only the booking's customer can review it, so `review` is that one review
 * and every party on the booking sees it. `reviews` / `hasReview` stay the
 * caller's own, as before.
 */
const bookingReviewFields = (booking, reviewContext, currentUserId) => {
  const allReviews = reviewContext?.reviews || [];

  return {
    isReviewed: Boolean(booking.isReviewed),
    review: allReviews.find(isReviewBy(booking.user?._id || booking.user)) || null,
    reviews: allReviews.filter(isReviewBy(currentUserId)),
    hasReview: reviewContext?.hasReview || false,
  };
};

const getBookingDetails = async (
  id,
  timezone,
  currentUserId,
  customer,
  isAdmin = false,
) => {
  const Booking = await BookingRepo.findBookingById(id);

  if (!Booking) {
    return null;
  }

  if (!isAdmin && !isBookingParty(Booking, currentUserId)) {
    return null;
  }

  // Same rule as the listing: for the customer it does not exist yet.
  if (customer && Booking.status === "pending") {
    return null;
  }

  const [reviewsByBooking, job] = await Promise.all([
    getReviewsForObjects({
      objectIds: [Booking._id],
      objectType: "Booking",
      currentUserId,
      limit: 0,
    }),
    findJobById_(Booking.job, "status"),
  ]);

  return {
    ...formatBookingToTimezone(Booking, timezone),
    jobStatus: job?.status || null,
    ...bookingReviewFields(
      Booking,
      reviewsByBooking.get(String(Booking._id)),
      currentUserId,
    ),
  };
};
const deleteBooking = async (id) => {
  if (!id) throw new Error("Booking ID is required");
  const deleted = await BookingRepo.deleteBooking(id);
  return !!deleted;
};

const getBookingCalendar = async ({
  timezone,
  latitude,
  longitude,
  startDate,
  endDate,
  user,
  branch,
  customer,
  supplier,
  userType,
}) => {
  let worker = [];
  if (userType === "nurse") {
    worker = [user];
  } else {
    worker = await (customer
      ? BookingRepo.getWorkerIdsByUserOrBranch(user, branch)
      : getStaffIdsByUser(user));
  }
  const [jobRoles, bookings, weather] = await Promise.all([
    getActiveJobRoles(),
    BookingRepo.getBookingsByUsersAndDateRange(
      worker,
      startDate,
      endDate,
      Boolean(customer),
    ),
    getWeather({ latitude, longitude, startDate, endDate, timezone }),
  ]);

  const { calendar, meta } = formatCalendar({
    jobRoles,
    bookings,
    weather,
    timezone,
    userType,
    customer,
    supplier,
    userId: user,
  });

  return { calendar, meta };
};
const hasShiftStarted = ({ date, startTime }) => {
  const shiftStart = new Date(date);
  const [hours, minutes] = startTime.split(":").map(Number);
  shiftStart.setUTCHours(hours, minutes, 0, 0);
  return Date.now() >= shiftStart.getTime();
};
const hasShiftEnded = ({ date, endTime }) => {
  const shiftEnd = new Date(date);
  const [hours, minutes] = endTime.split(":").map(Number);
  shiftEnd.setUTCHours(hours, minutes, 0, 0);

  return Date.now() >= shiftEnd.getTime();
};
const hasShiftPassed = ({ date, endTime }) => {
  if (!date || !endTime) return false;
  const shiftEnd = new Date(date);
  const [hours, minutes] = endTime.split(":").map(Number);
  shiftEnd.setUTCHours(hours, minutes, 0, 0);
  return Date.now() > shiftEnd.getTime();
};
// Application locations are represented as [latitude, longitude].
const isWithinRadius = (location1, location2, radiusInKm = 1) => {
  const [lat1, lng1] = location1.coordinates;
  const [lat2, lng2] = location2.coordinates;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371; // km

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const distance = 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return distance <= radiusInKm;
};
const updateBookingCheckinCheckout = async (id, data) => {
  const Booking = await BookingRepo.findBookingById_(id);

  if (!Booking) {
    return { error: "Booking_not_found" };
  }
  if (!isWithinRadius(Booking.snapshot.location, data.location, 1)) {
    return {
      error: "location_outside_allowed_radius",
    };
  }
  if (data.status === "checkin" && Booking.status !== "active") {
    return { error: "Cannot_check_in_inactive_booking" };
  }
  if (data.status === "checkout" && Booking.status !== "inProgress") {
    return { error: "Cannot_check_out_inactive_booking" };
  }
  if (hasShiftPassed(Booking.shift)) {
    return {
      error: "cannot_check_in_or_out_after_shift_end_time",
    };
  }
  if (data.status === "checkin") {
    // if (!hasShiftStarted(Booking.shift)) {
    //   return {
    //     error: "cannot_check_in_before_shift_start_time",
    //   };
    // }
    const attendance = {
      checkIn: new Date(),
      proofPicture: data.proofPicture || "",
      signature: data.signature || "",
      checkInLocation: {
        type: "Point",
        coordinates: [
          data.location.coordinates[0],
          data.location.coordinates[1],
        ],
      },
    };
    Booking.attendance = attendance;
    Booking.status = "inProgress";
  }
  if (data.status === "checkout") {
    // if (!hasShiftEnded(Booking.shift)) {
    //   return {
    //     error: "cannot_check_out_before_shift_end_time",
    //   };
    // }

    Booking.status = "completed";
    const attendance = Booking.attendance || {};
    attendance.checkOut = new Date();
    attendance.checkOutLocation = {
      type: "Point",
      coordinates: [data.location.coordinates[0], data.location.coordinates[1]],
    };
    Booking.attendance = attendance;
  }

  await Booking.save();

  /*
   * Checking out ends the shift for good. Without this the shift stays
   * "booked" forever, so the job never leaves the supplier's Active tab and
   * the customer can never see it as finished.
   */
  if (data.status === "checkout") {
    const jobId = Booking.job.toString();

    runInBackground(
      updateShiftStatus(
        jobId,
        Booking.shift._id.toString(),
        "completed",
      ).then(() => completeJobIfAllShiftsDone(jobId)),
      "complete shift and job for booking " + id,
    );
  }

  return Booking;
};
const getBookingCheckInLogs = async (
  bookingId,
  timezone,
  currentUserId,
  isAdmin = false,
) => {
  const Booking = await BookingRepo.findBookingById_(bookingId);

  if (!Booking) {
    return null;
  }

  if (!isAdmin && !isBookingParty(Booking, currentUserId)) {
    return null;
  }
  const attendance = Booking.attendance?.toObject() || {};
  const formattedAttendance = formatAttendance(attendance, timezone);

  return formattedAttendance;
};

const getShiftPlanCalendar = async ({
  year,
  month,
  timezone,
  user,
  userType,
}) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // last day of month

  const bookings = await BookingRepo.getBookingsByDateRangeForUser({
    userId: user,
    userType,
    startDate,
    endDate,
    hideUnacceptedAssignments: customerTypes.includes(userType),
  });

  return formatShiftPlan(bookings, timezone);
};

const getEarnings = async ({ userId, userType, from, to }) => {
  return BookingRepo.getEarnings({
    userId,
    userType,
    from,
    to,
    customer: customerTypes.includes(userType),
    supplier: supplierTypes.includes(userType),
  });
};
module.exports = {
  createBooking,
  getBooking,
  updateBooking,
  deleteBooking,
  getBookingDetails,
  getBookingCalendar,
  updateBookingCheckinCheckout,
  getBookingCheckInLogs,
  getShiftPlanCalendar,
  getEarnings,
};
