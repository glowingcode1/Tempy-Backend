const express = require("express");
const {
    getPriceRanges,
    getPriceRangeById,
    createPriceRange,
    updatePriceRange,
    deletePriceRange,
} = require("./priceRangeController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("PriceRanges");

router.get("/", apiRateLimiter, getPriceRanges);
router.get("/:id", apiRateLimiter, getPriceRangeById);
router.post("/", roleMiddleware(["admin"]), createPriceRange);
router.put("/:id", roleMiddleware(["admin"]), updatePriceRange);
router.delete("/:id", roleMiddleware(["admin"]), deletePriceRange);

module.exports = router;
