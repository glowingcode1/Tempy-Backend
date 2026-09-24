const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const {
  CONTRACT_SUPPLIER_TYPES,
  CONTRACT_CUSTOMER_TYPES,
} = require("./SupplierRelationship");
const {
  uploadContract,
  signContract,
  countersignContract,
  getRelationships,
  getRelationship,
} = require("./supplierRelationshipController");

const router = express.Router();

router.use(auth);

// Agreed rate parties, and employers with their nurses (see CONTRACT_KINDS).
const supplierOnly = roleMiddleware(CONTRACT_SUPPLIER_TYPES);
const customerOnly = roleMiddleware(CONTRACT_CUSTOMER_TYPES);
const allParties = [
  "admin",
  ...new Set([...CONTRACT_SUPPLIER_TYPES, ...CONTRACT_CUSTOMER_TYPES]),
];

// Both sides (and admin) can see the contract.
router.get("/", roleMiddleware(allParties), getRelationships);
router.get("/:id", roleMiddleware(allParties), getRelationship);

// Supplier uploads its own contract for a customer.
router.post("/", supplierOnly, uploadContract);

// Customer signs, then the supplier countersigns.
router.put("/:id/sign", customerOnly, signContract);
router.put("/:id/countersign", supplierOnly, countersignContract);

module.exports = router;
