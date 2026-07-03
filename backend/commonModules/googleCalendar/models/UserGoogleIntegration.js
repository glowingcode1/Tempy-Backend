const mongoose = require("mongoose");

const userGoogleIntegrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    googleId: String,
    email: String,

    accessToken: String,
    refreshToken: String,

    scope: String,

    tokenExpiry: Date,

    isConnected: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "UserGoogleIntegration",
  userGoogleIntegrationSchema
);