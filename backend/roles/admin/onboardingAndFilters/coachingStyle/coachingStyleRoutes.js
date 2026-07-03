const express = require("express");
const {
    getCoachingStyles,
    getCoachingStyleById,
    createCoachingStyle,
    updateCoachingStyle,
    deleteCoachingStyle,
} = require("./coachingStyleController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("CoachingStyles");

router.get("/", apiRateLimiter, getCoachingStyles);
router.get("/:id", apiRateLimiter, getCoachingStyleById);
router.post("/", roleMiddleware(["admin"]), createCoachingStyle);
router.put("/:id", roleMiddleware(["admin"]), updateCoachingStyle);
router.delete("/:id", roleMiddleware(["admin"]), deleteCoachingStyle);

module.exports = router;
