const mongoose = require("mongoose");

const CONTRACT_STATUSES = [
  "none", // supplier hasn't uploaded a contract yet
  "awaitingCustomer", // uploaded, customer still has to sign
  "awaitingSupplier", // customer signed, supplier still has to countersign
  "signed", // signed by both sides; it doesn't expire
];

/*
 * One record per supplier and customer pair. The supplier's contract lives
 * here, and it must be signed by both sides before the first shift between
 * them.
 */
const SupplierRelationshipSchema = new mongoose.Schema(
  {
    // agency, home care company or solo nurse
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // care home or individual
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
