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
const { updateShiftStatus } = require("../job/jobRepository");
const { formatAttendance } = require("./formator/formatAttendance");
const {
  getStaffIdsByUser,
} = require("../../../roles/aggency/staff/staffRepository");
const { customerTypes, supplierTypes } = require("@UsersModel");
const { resolveInitialBookingStatus } = require("./bookingStatusHelper");
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

  if (!bid) return { error: "Bid_not_found" };
  if (bid.status !== "accepted") return { error: "Bid_not_available" };

  const [user] = await Promise.all([findUserById(bid.user)]);

  if (!user) return { error: "User_not_found" };

  const payment = calculatePayment(
    bid.shift.startTime,
    bid.shift.endTime,
    bid.bid,
    bid.shift.breakMin,
    platformFee,
  );

  const bookingData = {
    ...data,
    user: bid.jobCreator,
    branch: bid.snapshot.branch,
    snapshot: bid.snapshot,
    employer: user.accountState.userType !== "nurse" ? bid.user : null,
    status: resolveInitialBookingStatus({
      createdByUserType: data?.createdByUserType || null,
      createdByUserId: data?.createdByUserId || null,
      workerId: data?.worker || null,
    }),
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
    },
  };

  const booking = await BookingRepo.createBooking(bookingData);

  if (!booking) {
    return { error: "Booking_creation_failed" };
  }
  const shiftID = booking.shift._id.toString();
  const jobId = booking.job.toString();
  void updateShiftStatus(jobId, shiftID, "booked");
  void updateBidStatuses(bid._id);
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
  });
  const formatedBooking = booking.map((job) => {
    return formatBookingToTimezone(job, timezone);
  });

  return { Booking: formatedBooking, meta };
};

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
    if (Booking.status !== "pending") {
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
    void updateBidStatuses(bidID, data.status, "pending");
    void updateShiftStatus(jobId, shiftID, "pending");
  }

  return Booking;
};

const getBookingDetails = async (id, timezone) => {
  const Booking = await BookingRepo.findBookingById(id);

  if (!Booking) {
    return null;
  }

  return formatBookingToTimezone(Booking, timezone);
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
    BookingRepo.getBookingsByUsersAndDateRange(worker, startDate, endDate),
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
const isWithinRadius = (location1, location2, radiusInKm = 1) => {
  const [lng1, lat1] = location1.coordinates;
  const [lng2, lat2] = location2.coordinates;

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
  if (data.status === "checkin") {
    if (!hasShiftStarted(Booking.shift)) {
      return {
        error: "cannot_check_in_before_shift_start_time",
      };
    }
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
    if (!hasShiftEnded(Booking.shift)) {
      return {
        error: "cannot_check_out_before_shift_end_time",
      };
    }

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

  return Booking;
};
const getBookingCheckInLogs = async (bookingId, timezone) => {
  const Booking = await BookingRepo.findBookingById_(bookingId);

  if (!Booking) {
    return { error: "Booking_not_found" };
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
