const express = require("express");
const {
    getSpecialities,
    getSpecialtyById,
    createSpecialty,
    updateSpecialty,
    deleteSpecialty,
} = require("./specialitiesController");
const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Specialties");

router.get("/", apiRateLimiter, getSpecialities);
router.get("/:id", apiRateLimiter, getSpecialtyById);
router.post("/", roleMiddleware(["admin"]), createSpecialty);
router.put("/:id", roleMiddleware(["admin"]), updateSpecialty);
router.delete("/:id", roleMiddleware(["admin"]), deleteSpecialty);

module.exports = router;
