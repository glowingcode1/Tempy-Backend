const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const { customerTypes, supplierTypes } = require("@UsersModel");
const {
  uploadContract,
  signContract,
  countersignContract,
  getRelationships,
  getRelationship,
} = require("./supplierRelationshipController");

const router = express.Router();

router.use(auth);

const allParties = ["admin", ...supplierTypes, ...customerTypes];

// Both sides (and admin) can see the contract.
router.get("/", roleMiddleware(allParties), getRelationships);
router.get("/:id", roleMiddleware(allParties), getRelationship);

// Supplier uploads its own contract for a customer.
router.post("/", roleMiddleware(supplierTypes), uploadContract);

// Customer signs, then the supplier countersigns.
router.put("/:id/sign", roleMiddleware(customerTypes), signContract);
router.put(
  "/:id/countersign",
  roleMiddleware(supplierTypes),
  countersignContract,
);

module.exports = router;
