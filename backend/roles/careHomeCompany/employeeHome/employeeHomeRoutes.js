const express = require("express");

const { getHome } = require("./employeeHomeController");

const auth = require("@middlewares/authMiddleware");
const createRateLimiter = require("@helperUtils/rateLimiter");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Home");

router.get(
  "/",
  auth,
  apiRateLimiter,
  getHome,
);

module.exports = router;
