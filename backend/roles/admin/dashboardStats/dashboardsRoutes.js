const express = require("express");
const {
  getDashboard,
} = require("./dashboardsController");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);


// Get all dashboards with pagination
router.get("/", roleMiddleware(["admin"]), getDashboard);


module.exports = router;
