const express = require("express");
const {
    getExperienceLevels,
    getExperienceLevelById,
    createExperienceLevel,
    updateExperienceLevel,
    deleteExperienceLevel,
} = require("./experienceLevelController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("ExperienceLevels");

router.get("/", apiRateLimiter, getExperienceLevels);
router.get("/:id", apiRateLimiter, getExperienceLevelById);
router.post("/", roleMiddleware(["admin"]), createExperienceLevel);
router.put("/:id", roleMiddleware(["admin"]), updateExperienceLevel);
router.delete("/:id", roleMiddleware(["admin"]), deleteExperienceLevel);

module.exports = router;
