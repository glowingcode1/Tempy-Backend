const express = require("express");
const moment = require("moment");
const {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
  getAvailableStaff,
} = require("./staffController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const StaffRateLimiter = createRateLimiter("Staff");

// Routes for Staff Management
// Create a new Staff
router.get("/nurses", roleMiddleware(["admin", "agency"]), getAllNurses);
router.post("/", roleMiddleware(["admin","agency",]), StaffRateLimiter, createStaff);

// Get all Staff with pagination        
router.get("/", roleMiddleware(["admin","agency","careHome","hospital"]), StaffRateLimiter, getStaff);
// Get all Staff with pagination        
router.get("/available", roleMiddleware(["admin","agency","careHome","hospital"]), StaffRateLimiter, getAvailableStaff);
// Get a specific Staff by ID
router.get("/:id", roleMiddleware(["admin","agency","careHome"]), StaffRateLimiter, getStaffDetails);


// Update an existing Staff
router.put("/:id", roleMiddleware(["admin","agency","careHome","hospital"]), updateStaff);


// Delete a Staff
router.delete("/:id", roleMiddleware(["admin","agency","careHome","hospital"]), deleteStaff);

module.exports = router;
