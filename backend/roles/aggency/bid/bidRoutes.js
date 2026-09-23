const express = require("express");
const moment = require("moment");
const {
  createBid,
  getBid,
  updateBid,
  deleteBid,
  getBidDetails,
} = require("./bidController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const requireVerifiedAccount = require("../../../middlewares/requireVerifiedAccount");
const requireTermsAccepted = require("../../../middlewares/requireTermsAccepted");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BidRateLimiter = createRateLimiter("Bid");

// Routes for Bid Management
// Create a new Bid
router.post(
  "/",
  roleMiddleware([
    "admin",
    "agency",
    "nurse",
    "careHome",
    "homeCareCompany",
    "hospital",
    "user",
  ]),
  requireVerifiedAccount,
  requireTermsAccepted,
  BidRateLimiter,
  createBid,
);

// Get all Bid with pagination
router.get(
  "/",
  roleMiddleware([
    "admin",
    "agency",
    "nurse",
    "homeCareCompany",
    "hospital",
    "careHome",
    "user",
  ]),
  BidRateLimiter,
  getBid,
);
// Get a specific Bid by ID
router.get(
  "/:id",
  roleMiddleware(["admin", "agency", "nurse", "homeCareCompany", "user", "hospital", "localAuthority", "careHome"]),
  BidRateLimiter,
  getBidDetails,
);

// Update an existing Bid
router.put(
  "/:id",
  roleMiddleware([
    "admin",
    "agency",
    "nurse",
    "homeCareCompany",
    "careHome",
    "hospital",
    "user",
  ]),
  updateBid,
);

// Delete a Bid
router.delete(
  "/:id",
  roleMiddleware(["admin", "agency", "nurse", "homeCareCompany", "user"]),
  deleteBid,
);

module.exports = router;
