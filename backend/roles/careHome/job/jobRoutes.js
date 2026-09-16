const express = require("express");
const moment = require("moment");
const {
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobDetails,
  getJobBids,
  updateJobBids,
} = require("./jobController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const requireVerifiedAccount = require("../../../middlewares/requireVerifiedAccount");
const { getJobRole } = require("../../admin/jobRole/jobRoleController");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const JobRateLimiter = createRateLimiter("Jobs");

// Routes for Job Management
// Create a new Job
router.post(
  "/",
  roleMiddleware(["admin", "careHome", "localAuthority", "hospital", "user"]),
  requireVerifiedAccount,
  JobRateLimiter,
  createJob,
);

// Get all Jobs with pagination
router.get(
  "/",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "nurse",
    "localAuthority",
    "homeCareCompany",
    "hospital",
    "user",
  ]),
  JobRateLimiter,
  getJobs,
);
router.get(
  "/type",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "employee",
    "localAuthority",
    "homeCareCompany",
    "hospital",
    "user",
  ]),
  JobRateLimiter,
  getJobRole,
);
router.get(
  "/bids",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "employee",
    "localAuthority",
    "homeCareCompany",
    "hospital",
    "user",
  ]),
  JobRateLimiter,
  getJobBids,
);
router.put(
  "/bids/:id",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "employee",
    "localAuthority",
    "homeCareCompany",
    "hospital",
    "user",
  ]),
  requireVerifiedAccount,
  JobRateLimiter,
  updateJobBids,
);
// Get a specific Job by ID
router.get(
  "/:id",
  roleMiddleware([
    "admin",
    "careHome",
    "agency",
    "employee",
    "localAuthority",
    "hospital",
    "user",
  ]),
  JobRateLimiter,
  getJobDetails,
);

// Update an existing Job
router.put(
  "/:id",
  roleMiddleware(["admin", "careHome", "localAuthority", "hospital", "user"]),
  updateJob,
);

// Delete a Job
router.delete(
  "/:id",
  roleMiddleware(["admin", "careHome", "localAuthority", "hospital", "user"]),
  deleteJob,
);

module.exports = router;
