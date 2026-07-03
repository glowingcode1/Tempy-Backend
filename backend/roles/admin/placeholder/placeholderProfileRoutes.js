const express = require("express");
const router = express.Router();

const authMiddleware = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const {
  getPlaceholderProfile,
  createPlaceholderProfile,
  updatePlaceholderProfile,
  deletePlaceholderProfile,
} = require("./placeholderProfileController");

const rateLimiter = createRateLimiter("CoachPlaceholderProfile");

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["coach", "admin"]),
  rateLimiter,
  getPlaceholderProfile
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["coach", "admin","user"]),
  rateLimiter,
  createPlaceholderProfile
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["coach", "admin"]),
  rateLimiter,
  updatePlaceholderProfile
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware([ "admin"]),
  rateLimiter,
  deletePlaceholderProfile
);

module.exports = router;