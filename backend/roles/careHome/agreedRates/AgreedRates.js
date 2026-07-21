const mongoose = require("mongoose");

const USER_TYPES = [
  // customers (post jobs)
  "hospital",
  "localAuthority",
  "careHome",
  "user",
];

const AgreedRateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobType",
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
