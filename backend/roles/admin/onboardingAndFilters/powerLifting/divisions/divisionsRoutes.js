const express = require("express");
const {
    getDivisions,
    getDivisionById,
    createDivision,
    updateDivision,
    deleteDivision,
} = require("./divisionsController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Divisions");

router.get("/", apiRateLimiter, getDivisions);
router.get("/:id", apiRateLimiter, getDivisionById);
router.post("/", roleMiddleware(["admin"]), createDivision);
router.put("/:id", roleMiddleware(["admin"]), updateDivision);
router.delete("/:id", roleMiddleware(["admin"]), deleteDivision);

module.exports = router;
