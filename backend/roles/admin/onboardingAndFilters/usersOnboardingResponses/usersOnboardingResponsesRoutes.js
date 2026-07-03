const express = require("express");
const {
  getUsersOnboardingResponses,
  getUsersOnboardingResponseById,
  upsertUsersOnboardingResponse,
  deleteUsersOnboardingResponse,
} = require("./usersOnboardingResponsesController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("UsersOnboardingResponses");

router.get("/", apiRateLimiter, getUsersOnboardingResponses);
router.get("/:id", apiRateLimiter, getUsersOnboardingResponseById);
// Single upsert route for create/update by user
router.post("/", upsertUsersOnboardingResponse);
router.delete("/:id", deleteUsersOnboardingResponse);

module.exports = router;
