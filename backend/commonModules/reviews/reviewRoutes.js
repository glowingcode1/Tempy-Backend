const express = require("express");
const createRateLimiter = require("@helperUtils/rateLimiter");
const auth = require("@middlewares/authMiddleware");

const {
  createReview,
  getReviewsByType,
  updateReviewById,
  deleteReviewById,
  getReviewById,
  getReview,
  getallReview
} = require("./reviewController");
const { getReviewTemplates } = require("../../roles/admin/reviewTemplate/reviewTemplateController");
const roleMiddleware = require("@middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
const reviewsRateLimiter = createRateLimiter("Reviews");
router.get("/template", reviewsRateLimiter,getReviewTemplates );
router.post("/", reviewsRateLimiter, createReview);
router.get("/all/:user", reviewsRateLimiter, getReview);
router.get("/", reviewsRateLimiter, getallReview);
router.get("/:reviewType/:entityId", reviewsRateLimiter, getReviewsByType);
router.get("/:reviewId", reviewsRateLimiter, getReviewById);


router.put("/:reviewId", reviewsRateLimiter, updateReviewById);

router.delete("/:reviewId", reviewsRateLimiter, deleteReviewById);

module.exports = router;
