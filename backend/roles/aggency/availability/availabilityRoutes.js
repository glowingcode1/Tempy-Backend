const express = require("express");
const {
  createAvailability,
  getAvailability,
  updateAvailability,
  deleteAvailability,
} = require("./availabilityController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Availability
const AvailabilityRateLimiter = createRateLimiter("Availability");

// Routes for Availability Management
// Available to all authenticated roles

// Create a new Availability entry
router.post("/", AvailabilityRateLimiter, createAvailability);

// Get all Availability entries with pagination
router.get("/", AvailabilityRateLimiter, getAvailability);

// Update an existing Availability entry
router.put("/:id", updateAvailability);

// Delete an Availability entry
router.delete("/:id", deleteAvailability);

module.exports = router;
