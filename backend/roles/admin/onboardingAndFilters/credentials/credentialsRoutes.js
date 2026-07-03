const express = require("express");
const {
    getCredentials,
    getCredentialById,
    createCredential,
    updateCredential,
    deleteCredential,
} = require("./credentialsController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Credentials");

router.get("/", apiRateLimiter, getCredentials);
router.get("/:id", apiRateLimiter, getCredentialById);
router.post("/", roleMiddleware(["admin"]), createCredential);
router.put("/:id", roleMiddleware(["admin"]), updateCredential);
router.delete("/:id", roleMiddleware(["admin"]), deleteCredential);

module.exports = router;
