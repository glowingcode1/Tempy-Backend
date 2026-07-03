const express = require("express");
const {
  createSubAdmins,
  getSubAdmins,
  updateSubAdmins,
  deleteSubAdmins,
  getPermissions,
} = require("./subAdminsController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for SubAdmins
const SubAdminsRateLimiter = createRateLimiter("SubAdmins");

// Routes for SubAdmins Management
// Create a new SubAdmin
router.post("/", roleMiddleware(["admin"]), SubAdminsRateLimiter, createSubAdmins);

// Get all SubAdmins with pagination
router.get("/", roleMiddleware(["admin"]), SubAdminsRateLimiter, getSubAdmins);
router.get("/permissions", roleMiddleware(["admin"]), SubAdminsRateLimiter, getPermissions);


// Update an existing SubAdmin
router.put("/:id", roleMiddleware(["admin"]), updateSubAdmins);

// Delete a SubAdmin
router.delete("/:id", roleMiddleware(["admin"]), deleteSubAdmins);

module.exports = router;
