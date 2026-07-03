const express = require("express");

const {
  createAccount,
  getOnBoardingUrl,
  accountOnBoardingUrl,
  attachUserPaymentMethods,
  detachUserPaymentMethods,
  getUserPaymentMethods,
  resendOnboardAccountMail,
  getAccount,
} = require("../controllers/stripeAccountController");

const auth = require("@middlewares/authMiddleware");

const router = express.Router();

/**
 * PUBLIC STRIPE REFRESH ROUTE
 * Used by Stripe Account Link refresh_url.
 */
router.get("/onboard/:id", accountOnBoardingUrl);

/**
 * AUTH REQUIRED FOR APP STRIPE OPERATIONS
 */
router.use(auth);

/**
 * STRIPE CONNECT ACCOUNT
 */
router.post("/create", createAccount);
router.get("/account", getAccount);

/**
 * ONBOARDING
 */
router.get("/onboarding-url", getOnBoardingUrl);

/**
 * RESEND ONBOARDING EMAIL / LINK
 */
router.post("/resend", resendOnboardAccountMail);

/**
 * PAYMENT METHODS
 */
router.get("/methods", getUserPaymentMethods);
router.post("/methods", attachUserPaymentMethods);
router.put("/methods", detachUserPaymentMethods);

module.exports = router;