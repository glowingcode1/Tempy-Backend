const express = require("express");
const moment = require("moment");
const {
  createFavorite,
  getFavorite,
  updateFavorite,
  deleteFavorite,
  getFavoriteDetails,

} = require("./favoriteController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const FavoriteRateLimiter = createRateLimiter("Favorite");

// Routes for Favorite Management
// Create a new Favorite

router.post("/", roleMiddleware(["admin","careHome",]), FavoriteRateLimiter, createFavorite);

// Get all Favorite with pagination
router.get(
  "/",
  roleMiddleware(["admin", "careHome"]),
  FavoriteRateLimiter,
  getFavorite,
);
// Get a specific Favorite by ID
router.get("/:id", roleMiddleware(["admin","careHome","employee"]), FavoriteRateLimiter, getFavoriteDetails);


// Update an existing Favorite
router.put("/:id", roleMiddleware(["admin","careHome","employee"]), updateFavorite);


// Delete a Favorite
router.delete("/:id", roleMiddleware(["admin","careHome","employee"]), deleteFavorite);

module.exports = router;
