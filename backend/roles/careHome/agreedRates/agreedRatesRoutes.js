const express = require("express");
const {
  createAgreedRate,
  getAgreedRates,
  updateAgreedRate,
  withdrawAgreedRate,
  acceptAgreedRate,
  rejectAgreedRate,
  requestAgreedRateReview,
} = require("./agreedRatesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const requireTermsAccepted = require("../../../middlewares/requireTermsAccepted");
const {
  getUsersByType,
} = require("../../admin/usersManagement/usersController");
const { SUPPLIER_TYPES, CUSTOMER_TYPES } = require("./AgreedRates");

const router = express.Router();

router.use(auth);

const AgreedRateLimiter = createRateLimiter("AgreedRates");

const supplierOnly = roleMiddleware(SUPPLIER_TYPES);
const customerOnly = roleMiddleware(CUSTOMER_TYPES);

// Both sides (and admin) can see the rates between them.
router.get(
  "/",
  roleMiddleware(["admin", ...SUPPLIER_TYPES, ...CUSTOMER_TYPES]),
  AgreedRateLimiter,
  getAgreedRates,
);

router.get("/users", getUsersByType);

// The supplier sets the rate and can change it until the customer agrees.
router.post(
  "/",
  supplierOnly,
  requireTermsAccepted,
  AgreedRateLimiter,
  createAgreedRate,
);
router.put("/:id", supplierOnly, updateAgreedRate);
router.put("/:id/withdraw", supplierOnly, withdrawAgreedRate);

// The customer accepts, rejects or asks for a lower rate.
router.put("/:id/accept", customerOnly, acceptAgreedRate);
router.put("/:id/reject", customerOnly, rejectAgreedRate);
router.put("/:id/review", customerOnly, requestAgreedRateReview);

module.exports = router;
