// backend/roles/careHome/home/homeRoutes.js

const express = require("express");

const { getHome } = require("./homeController");

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
