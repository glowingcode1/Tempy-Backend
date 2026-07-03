const express = require("express");
const {
    getFederations,
    getFederationById,
    createFederation,
    updateFederation,
    deleteFederation,
} = require("./federationsController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Federations");

router.get("/", apiRateLimiter, getFederations);
router.get("/:id", apiRateLimiter, getFederationById);
router.post("/", roleMiddleware(["admin"]), createFederation);
router.put("/:id", roleMiddleware(["admin"]), updateFederation);
router.delete("/:id", roleMiddleware(["admin"]), deleteFederation);

module.exports = router;
