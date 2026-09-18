const express = require("express");
const moment = require("moment");
const {
  createJobRole,
  getJobRole,
  updateJobRole,
  deleteJobRole,
  getJobRoleDetails,
  getMyJobRoles,
  updateMyJobRoles,
} = require("./jobRoleController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const { supplierTypes } = require("@UsersModel");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const JobRoleRateLimiter = createRateLimiter("JobRole");

// Routes for JobRole Management
// Create a new JobRole
router.post("/", roleMiddleware(["admin"]), JobRoleRateLimiter, createJobRole);

// Get all JobRole with pagination
router.get("/", roleMiddleware(["admin", "employee", ...supplierTypes]), JobRoleRateLimiter, getJobRole);
// A supplier's own job roles (shown as rows on its shift calendar).
// Declared before "/:id" so "mine" is not read as an id.
router.get("/mine", roleMiddleware(supplierTypes), JobRoleRateLimiter, getMyJobRoles);
router.put("/mine", roleMiddleware(supplierTypes), JobRoleRateLimiter, updateMyJobRoles);

// Get a specific JobRole by ID
router.get("/:id", roleMiddleware(["admin", "employee", ...supplierTypes]), JobRoleRateLimiter, getJobRoleDetails);


// Update an existing JobRole
router.put("/:id", roleMiddleware(["admin"]), updateJobRole);

// Delete a JobRole
router.delete("/:id", roleMiddleware(["admin"]), deleteJobRole);

module.exports = router;
