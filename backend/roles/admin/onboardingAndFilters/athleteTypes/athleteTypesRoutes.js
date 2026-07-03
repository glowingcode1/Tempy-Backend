const express = require("express");
const {
    getAthleteTypes,
    getAthleteTypeById,
    createAthleteType,
    updateAthleteType,
    deleteAthleteType,
} = require("./athleteTypesController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("AthleteTypes");

router.get("/", apiRateLimiter, getAthleteTypes);
router.get("/:id", apiRateLimiter, getAthleteTypeById);
router.post("/", roleMiddleware(["admin"]), createAthleteType);
router.put("/:id", roleMiddleware(["admin"]), updateAthleteType);
router.delete("/:id", roleMiddleware(["admin"]), deleteAthleteType);

module.exports = router;
