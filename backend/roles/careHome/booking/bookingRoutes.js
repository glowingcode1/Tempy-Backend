const express = require("express");
const moment = require("moment");
const {
  createBooking,
  getBooking,
  updateBooking,
  deleteBooking,
  getBookingDetails,
  getBookingCalender,
  getBookingCheckInLogs,
  getShiftPlanCalendar,
  getEarnings,
} = require("./bookingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const requireVerifiedAccount = require("../../../middlewares/requireVerifiedAccount");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BookingRateLimiter = createRateLimiter("Booking");

// GET API of Earnings
router.get("/earnings", getEarnings);

router.get(
  "/calender",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "nurse",
    "localAuthority",
    "user",
    "homeCareCompany",
    "hospital",
  ]),
  getBookingCalender,
);

router.get(
  "/shifts-calender",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "nurse",
    "localAuthority",
    "user",
    "hospital",
  ]),
  getShiftPlanCalendar,
);
// Routes for Booking Management
// Create a new Booking
router.post(
  "/",
  roleMiddleware([
    "admin",
    "careHome",
    "localAuthority",
    "agency",
    "nurse",
    "hospital",
    "user",
  ]),
  requireVerifiedAccount,
  BookingRateLimiter,
  createBooking,
);

// Get all Booking with pagination
router.get(
  "/",
  roleMiddleware([
    "admin",
    "agency",
    "nurse",
    "careHome",
    "localAuthority",
    "user",
    "hospital",
  ]),
  BookingRateLimiter,
  getBooking,
);
// Get a specific Booking by ID
router.get(
  "/:id",
  roleMiddleware([
    "admin",
    "agency",
    "employee",
    "nurse",
    "careHome",
    "localAuthority",
    "user",
  ]),
  BookingRateLimiter,
  getBookingDetails,
);

// Update an existing Booking
router.put(
  "/:id",
  roleMiddleware([
    "admin",
    "agency",
    "employee",
    "nurse",
    "localAuthority",
    "user",
  ]),
  updateBooking,
);
router.get(
  "/logs/:bookingId",
  roleMiddleware([
    "admin",
    "agency",
    "employee",
    "nurse",
    "localAuthority",
    "user",
  ]),
  getBookingCheckInLogs,
);

// Delete a Booking
router.delete(
  "/:id",
  roleMiddleware([
    "admin",
    "agency",
    "employee",
    "nurse",
    "localAuthority",
    "user",
  ]),
  deleteBooking,
);

module.exports = router;
