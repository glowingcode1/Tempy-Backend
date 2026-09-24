const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema(
  {
    terms_and_conditions: {
      type: String,
      trim: true,
    },
    // Bumped every time terms_and_conditions changes, so suppliers who
    // accepted an older version are asked to accept again.
    terms_version: {
      type: Number,
      default: 1,
    },
    // Temp to permanent: shifts a worker must have done for a care home
    // before it can hire them, and the fee it pays (amount still to be
    // decided, so admin sets it).
    temp_to_perm_min_shifts: {
      type: Number,
      default: 0,
      min: 0,
    },
    temp_to_perm_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    review_terms_and_conditions: {
      type: String,
      trim: true,
    },
    about_us: {
      type: String,
      trim: true,
    },
    privacy_policy: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

const AdminSettings = mongoose.model("AdminSettings", adminSettingsSchema);

module.exports = AdminSettings;
