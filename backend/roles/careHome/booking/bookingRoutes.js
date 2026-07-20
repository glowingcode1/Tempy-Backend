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
} = require("./bookingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BookingRateLimiter = createRateLimiter("Booking");
router.get(
  "/calender",
  roleMiddleware(["admin", "careHome","agency", "nurse"]),
  getBookingCalender,
);
// Routes for Booking Management
// Create a new Booking
router.post(
  "/",
  roleMiddleware(["admin", "careHome"]),
  BookingRateLimiter,
  createBooking,
);

// Get all Booking with pagination
router.get(
  "/",
  roleMiddleware(["admin", "agency", "nurse", "careHome"]),
  BookingRateLimiter,
  getBooking,
);
// Get a specific Booking by ID
router.get(
  "/:id",
  roleMiddleware(["admin", "agency", "employee", "nurse", "careHome"]),
  BookingRateLimiter,
  getBookingDetails,
);

// Update an existing Booking
router.put(
  "/:id",
  roleMiddleware(["admin", "agency", "employee", "nurse"]),
  updateBooking,
);
router.get(
  "/logs/:bookingId",
  roleMiddleware(["admin", "agency", "employee", "nurse"]),
  getBookingCheckInLogs,
);

// Delete a Booking
router.delete(
  "/:id",
  roleMiddleware(["admin", "agency", "employee", "nurse"]),
  deleteBooking,
);
router.get(
  "/calender",
  roleMiddleware(["admin", "careHome"]),
  getBookingCalender,
);

module.exports = router;
