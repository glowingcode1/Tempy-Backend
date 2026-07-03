const express = require("express");
const {
    getTimezones,
    getTimezoneById,
    createTimezone,
    updateTimezone,
    deleteTimezone,
} = require("./timezonesController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Timezones");

router.get("/", apiRateLimiter, getTimezones);
router.get("/:id", apiRateLimiter, getTimezoneById);
router.post("/", roleMiddleware(["admin"]), createTimezone);
router.put("/:id", roleMiddleware(["admin"]), updateTimezone);
router.delete("/:id", roleMiddleware(["admin"]), deleteTimezone);

module.exports = router;
