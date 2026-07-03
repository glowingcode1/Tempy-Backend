const mongoose = require("mongoose");

const usersStripeAccountsSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    accountId: {
      type: String,
      required: true,
    },

    onboardingStatus: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },

    isActive: {
      type: Boolean,
      default: false,
    },

    chargesEnabled: {
      type: Boolean,
      default: false,
    },

    payoutsEnabled: {
      type: Boolean,
      default: false,
    },

    detailsSubmitted: {
      type: Boolean,
      default: false,
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    lastSyncedAt: {
      type: Date,
      default: null,
    },

    lastStripeEventId: {
      type: String,
      default: "",
    },

    requirementsCurrentlyDue: {
      type: [String],
      default: [],
    },

    requirementsPastDue: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

usersStripeAccountsSchema.index({ user: 1 }, { unique: true });
usersStripeAccountsSchema.index({ accountId: 1 }, { unique: true });

module.exports = mongoose.model("UsersStripeAccounts", usersStripeAccountsSchema);
