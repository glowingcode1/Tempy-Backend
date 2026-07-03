const express = require("express");

const {
  handleStripeWebhook,
} = require("../controllers/stripeAccountController");

const router = express.Router();

// Stripe webhook payload must be passed as raw body bytes to verify the signature.
// Using express.raw here ensures the body is not parsed/modified before constructEvent.
router.post(
  "/stripe",
  express.raw({ type: "*/*", limit: "10mb" }),
  handleStripeWebhook
);

module.exports = router;