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
const { formatCalendar } = require("./formator/calendarFormatter");
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
  if (!latitude || !longitude) {
    throw new Error(`Missing coordinates: lat=${latitude} lng=${longitude}`);
  }
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

  if (!res.ok) throw new Error(data.reason || "Weather API failed");

  return data;
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
  if (bid.status !== "pending") return { error: "Bid_not_available" };

  const [user] = await Promise.all([findUserById(bid.user)]);

  if (!user) return { error: "User_not_found" };

  const payment = calculatePayment(
    bid.shift.startTime,
    bid.shift.endTime,
    bid.bid,
    bid.snapshot.breakMin,
    platformFee,
  );

  const bookingData = {
    ...data,
    user: bid.jobCreater,
    snapshot: bid.snapshot,
    employer: user.accountState.userType !== "nurse" ? bid.user : null,
    shift: {
      _id: bid.shift._id,
      date: bid.shift.date,
      startTime: bid.shift.startTime,
      endTime: bid.shift.endTime,
      isBreak: bid.snapshot.shift.isBreak,
      breakMin: bid.snapshot.shift.breakMin,
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
  await updateBidStatuses(bid._id);
  return booking;
};

const getBooking = async ({ timezone, page, limit, keyword, status, user }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { booking, meta } = await BookingRepo.getBooking({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });
  const formatedBooking = booking.map((job) => {
    return formatBookingToTimezone(job, timezone);
  });

  return { Booking: formatedBooking, meta };
};

const updateBooking = async (id, data) => {
  const Booking = await BookingRepo.findBookingById_(id);
  if (data.shift && data.job) {
    const [{ user, shift }, snapshot] = await Promise.all([
      BookingRepo.getUserAndShift(data.job, data.shift),
      BookingRepo.findJobById_(data.job),
    ]);

    data.snapshot = snapshot;
    data.jobCreater = user;
    data.shift = shift;
  }

  if (!Booking) {
    return { error: "Booking_not_found" };
  }

  const allowedFields = ["Booking", "note", "status", "shift", "job"];

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

const getBookingCalender = async ({
  timezone,
  latitude,
  longitude,
  startDate,
  endDate,
  user,
  branch,
}) => {
  const userIds = await convertToMongoArray(user);
  const [jobRoles, bookings, weather] = await Promise.all([
    getActiveJobRoles(),
    BookingRepo.getBookingsByUsersAndDateRange(userIds, startDate, endDate),
    getWeather({ latitude, longitude, startDate, endDate, timezone }),
  ]);
  console.log("bookings", bookings);
  const { calendar,meta } = formatCalendar({
    jobRoles,
    bookings,
    weather,
  });

  return { calendar, meta };
};

module.exports = {
  createBooking,
  getBooking,
  updateBooking,
  deleteBooking,
  getBookingDetails,
  getBookingCalender,
};
