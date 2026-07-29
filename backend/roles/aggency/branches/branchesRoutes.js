const express = require("express");
const {
  createBranch,
  getBranch,
  updateBranch,
  deleteBranch,
  getBranchDetails,
} = require("./branchesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BranchRateLimiter = createRateLimiter("Branch");

const BRANCH_ROLES = [
  "admin",
  "hospital",
  "localAuthority",
  "careHome",
  "agency",
  "homeCareCompany",
  "user",
];

// Routes for Branch Management
// Create a new Branch
router.post("/", roleMiddleware(BRANCH_ROLES), BranchRateLimiter, createBranch);

// Get all Branch with pagination
router.get("/", roleMiddleware(BRANCH_ROLES), BranchRateLimiter, getBranch);
// Get a specific Branch by ID
router.get(
  "/:id",
  roleMiddleware(BRANCH_ROLES),
  BranchRateLimiter,
  getBranchDetails,
);

// Update an existing Branch
router.put("/:id", roleMiddleware(BRANCH_ROLES), updateBranch);

// Delete a Branch
router.delete("/:id", roleMiddleware(BRANCH_ROLES), deleteBranch);

module.exports = router;
