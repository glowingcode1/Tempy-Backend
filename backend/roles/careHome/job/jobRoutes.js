const express = require("express");
const moment = require("moment");
const {
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobDetails,
} = require("./jobController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const JobRateLimiter = createRateLimiter("Jobs");

// Routes for Job Management
// Create a new Job
router.post("/", roleMiddleware(["admin","careHome"]), JobRateLimiter, createJob);

// Get all Jobs with pagination
router.get("/", roleMiddleware(["admin","careHome","agency"]), JobRateLimiter, getJobs);
// Get a specific Job by ID
router.get("/:id", roleMiddleware(["admin", "careHome"]), JobRateLimiter, getJobDetails);


// Update an existing Job
router.put("/:id", roleMiddleware(["admin","careHome"]), updateJob);

// Delete a Job
router.delete("/:id", roleMiddleware(["admin","careHome"]), deleteJob);

module.exports = router;
