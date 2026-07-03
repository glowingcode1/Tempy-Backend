const express = require("express");
const {
    getDistanceRanges,
    getDistanceRangeById,
    createDistanceRange,
    updateDistanceRange,
    deleteDistanceRange,
} = require("./distancesRangeController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("DistanceRanges");

router.get("/", apiRateLimiter, getDistanceRanges);
router.get("/:id", apiRateLimiter, getDistanceRangeById);
router.post("/", roleMiddleware(["admin"]), createDistanceRange);
router.put("/:id", roleMiddleware(["admin"]), updateDistanceRange);
router.delete("/:id", roleMiddleware(["admin"]), deleteDistanceRange);

module.exports = router;
