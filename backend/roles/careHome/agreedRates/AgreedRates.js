const mongoose = require("mongoose");

/*
 * Loaded for its side effect: it registers the JobRole model. The list and
 * update endpoints populate jobType, and populate resolves the ref by name at
 * call time, so the model has to exist by then rather than depending on some
 * other route happening to load it first.
 */
require("../../admin/jobRole/JobRole");

const SUPPLIER_TYPES = ["agency", "homeCareCompany", "nurse"];
// The rate is for a care home or an individual.
const CUSTOMER_TYPES = ["careHome", "user"];

const STATUSES = [
  "pending", // offered by the supplier, waiting on the customer
  "reviewRequested", // customer asked for a lower rate, waiting on the supplier
  "accepted", // customer agreed; applies from effectiveFrom
  "rejected", // customer said no
  "withdrawn", // supplier pulled the offer, no penalty
];
// Offers the supplier can still change or withdraw.
const OPEN_STATUSES = ["pending", "reviewRequested"];

const ratesSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 0 },
    night: { type: Number, required: true, min: 0 },
    weekend: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/*
 * A rate offer the supplier makes to a customer for one job role (care,
 * senior care, ...). A rate change is simply a new offer with a later
 * effectiveFrom (usually 1 April); the previously accepted rate keeps
 * applying until the new one is accepted and its start date arrives.
 */
const AgreedRateSchema = new mongoose.Schema(
  {
    // agency, home care company or solo nurse
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    supplierType: {
      type: String,
      enum: SUPPLIER_TYPES,
    },
    // care home or individual
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobRole",
      required: true,
    },
    // hourly rates
    rates: {
      type: ratesSchema,
      required: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    // Filled when the customer asks for a lower rate.
    review: {
      note: { type: String, default: "" },
      requestedRates: { type: ratesSchema, default: undefined },
      requestedAt: { type: Date, default: null },
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

AgreedRateSchema.index({ supplier: 1, customer: 1, jobType: 1, status: 1 });

const AgreedRate = mongoose.model("AgreedRate", AgreedRateSchema);

module.exports = AgreedRate;
module.exports.SUPPLIER_TYPES = SUPPLIER_TYPES;
module.exports.CUSTOMER_TYPES = CUSTOMER_TYPES;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
