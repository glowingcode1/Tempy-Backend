const express = require("express");
const {
  createAddress,
  getAddress,
  updateAddress,
  deleteAddress,
} = require("./addressController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const AddressRateLimiter = createRateLimiter("Addresss");

router.post(
  "/",
  roleMiddleware([
    "nurse",
    "admin",
    "careHome",
    "user",
    "agency",
    "homeCareCompany",
    "localAuthority",
  ]),
  AddressRateLimiter,
  createAddress,
);

router.get(
  "/",
  roleMiddleware([
    "nurse",
    "admin",
    "careHome",
    "user",
    "agency",
    "homeCareCompany",
    "localAuthority",
  ]),
  AddressRateLimiter,
  getAddress,
);

router.put(
  "/:id",
  roleMiddleware([
    "nurse",
    "admin",
    "careHome",
    "user",
    "agency",
    "homeCareCompany",
    "localAuthority",
  ]),
  updateAddress,
);

router.delete(
  "/:id",
  roleMiddleware([
    "nurse",
    "admin",
    "careHome",
    "user",
    "agency",
    "homeCareCompany",
    "localAuthority",
  ]),
  deleteAddress,
);

module.exports = router;
