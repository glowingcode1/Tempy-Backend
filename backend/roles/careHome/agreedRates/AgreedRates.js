const mongoose = require("mongoose");

/*
 * Loaded for its side effect: it registers the JobRole model. The update
 * endpoint populates jobType, and populate resolves the ref by name at call
 * time, so the model has to exist by then rather than depending on some other
 * route happening to load it first.
 */
require("../../admin/jobRole/JobRole");

const USER_TYPES = ["agency", "homeCareCompany", "nurse"];

const AgreedRateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobType: {
      type: mongoose.Schema.Types.ObjectId,
      // The model is registered as JobRole (collection jobroles). There has
      // never been a JobType model, so populating this ref threw.
      ref: "JobRole",
      required: true,
    },
    objectType: {
      type: String,
      enum: USER_TYPES,
      index: true,
    },
    objectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rateType: {
      type: String,
      enum: ["hourly", "fixed"],
      required: true,
      default: "hourly",
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    autoAssign: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);
AgreedRateSchema.index(
  { user: 1, objectId: 1, JobType: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } },
);
const AgreedRate = mongoose.model("AgreedRate", AgreedRateSchema);

module.exports = AgreedRate;
