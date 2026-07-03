const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const {
  getPlans,
  getEarnings,
  getCoaches,
  getCoacheDetails,
} = require("./generalController");

const router = express.Router();
router.get("/coaches", getCoaches);
router.get("/coaches/:id", getCoacheDetails);

router.use(auth);

router.get("/plans", getPlans);
router.get("/earnings", getEarnings);


module.exports = router;
