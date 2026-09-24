const mongoose = require("mongoose");
const AgreedRate = require("../../roles/careHome/agreedRates/AgreedRates");

const CONTRACT_STATUSES = [
  "none", // supplier hasn't uploaded a contract yet
  "awaitingCustomer", // uploaded, customer still has to sign
  "awaitingSupplier", // customer signed, supplier still has to countersign
  "signed", // signed by both sides; it doesn't expire
];

/*
 * The only two relationships that carry a contract. No other flow (job bids,
 * bookings, permanent hires, ...) has a contract or checks one.
 *   agreedRate: the supplier offering rates and the customer agreeing to them.
 *               Signed before the customer can accept a rate.
 *   staff:      an agency or home care company and a nurse it hires. Signed
 *               before the nurse can accept the staff request.
 */
const CONTRACT_KINDS = {
  agreedRate: {
    suppliers: AgreedRate.SUPPLIER_TYPES,
    customers: AgreedRate.CUSTOMER_TYPES,
  },
  staff: {
    suppliers: ["agency", "homeCareCompany"],
    customers: ["nurse"],
  },
};

// The contract kind between these two user types, or null when none applies.
const contractKindFor = (supplierType, customerType) =>
  Object.keys(CONTRACT_KINDS).find(
    (kind) =>
      CONTRACT_KINDS[kind].suppliers.includes(supplierType) &&
      CONTRACT_KINDS[kind].customers.includes(customerType),
  ) || null;

const allOf = (side) => [
  ...new Set(Object.values(CONTRACT_KINDS).flatMap((kind) => kind[side])),
];
// Who can upload/countersign, and who can sign.
const CONTRACT_SUPPLIER_TYPES = allOf("suppliers");
const CONTRACT_CUSTOMER_TYPES = allOf("customers");

/*
 * One record per supplier and customer pair, holding the supplier's contract.
 * "supplier" is the side that uploads and countersigns (for staff, the
 * employer); "customer" is the side that signs first (for staff, the nurse).
 */
const SupplierRelationshipSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: Object.keys(CONTRACT_KINDS),
      required: true,
    },
    // agency, home care company or solo nurse
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // care home or individual; the nurse for a staff contract
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contract: {
      // the supplier's own contract (uploaded file path)
      document: { type: String, default: "" },
      customerSignature: { type: String, default: "" },
      customerSignedAt: { type: Date, default: null },
      supplierSignature: { type: String, default: "" },
      supplierSignedAt: { type: Date, default: null },
      // the copy signed by both sides, which both of them get
      signedDocument: { type: String, default: "" },
      status: {
        type: String,
        enum: CONTRACT_STATUSES,
        default: "none",
      },
    },
  },
  { timestamps: true },
);

SupplierRelationshipSchema.index(
  { supplier: 1, customer: 1 },
  { unique: true },
);
SupplierRelationshipSchema.index({ customer: 1 });

const SupplierRelationship = mongoose.model(
  "SupplierRelationship",
  SupplierRelationshipSchema,
);

module.exports = SupplierRelationship;
module.exports.CONTRACT_STATUSES = CONTRACT_STATUSES;
module.exports.CONTRACT_KINDS = CONTRACT_KINDS;
module.exports.CONTRACT_SUPPLIER_TYPES = CONTRACT_SUPPLIER_TYPES;
module.exports.CONTRACT_CUSTOMER_TYPES = CONTRACT_CUSTOMER_TYPES;
module.exports.contractKindFor = contractKindFor;
