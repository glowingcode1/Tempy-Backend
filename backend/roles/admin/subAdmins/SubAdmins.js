const mongoose = require("mongoose");
const FEATURE_KEYS = {
  DASHBOARD: "manage_dashboard",
  USERS: "manage_users",
  COACHES: "manage_coaches",
  ATHLETES: "manage_athletes",
  SESSIONS: "manage_sessions",
  SEARCHES: "manage_searches",
  REVIEWS: "manage_reviews",
  PLACEHOLDER_PROFILE: "manage_placeholder_profile",
  ONBOARDING: "manage_onboarding",
  FAQS: "manage_faqs",
  SUPPORT: "manage_support",
  HELP_CENTER: "manage_help_center",
  ADMIN_SETTINGS: "manage_admin_settings",
};
const FEATURE_ENUM_KEYS = Object.keys(FEATURE_KEYS);
const SubAdminSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },
    permissions: [
      {
        type: String,

        enum: FEATURE_ENUM_KEYS,
      },
    ],
  },

  { timestamps: true },
);
SubAdminSchema.index({ creator: 1, user: 1 }, { unique: true });

const SubAdmin = mongoose.model("SubAdmin", SubAdminSchema);

module.exports = { SubAdmin, FEATURE_KEYS };
