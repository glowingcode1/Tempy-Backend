const express = require("express");
const {
  createReviewTemplate,
  getReviewTemplates,
  updateReviewTemplate,
  deleteReviewTemplate,
} = require("./reviewTemplateController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const ReviewTemplateRateLimiter = createRateLimiter("ReviewTemplates");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", roleMiddleware(["admin"]), ReviewTemplateRateLimiter, createReviewTemplate);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin","user","coach"]), ReviewTemplateRateLimiter, getReviewTemplates);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateReviewTemplate);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteReviewTemplate);

module.exports = router;
