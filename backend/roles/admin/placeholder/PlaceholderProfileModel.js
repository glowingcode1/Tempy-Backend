const mongoose = require("mongoose");

const PlaceholderProfileUserSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phoneNumber: {
      code: {
        type: String,
        default: "",
      },
      number: {
        type: String,
        default: "",
      },
    },

    images: {
      type: String,
      default: "",
    },

    notification: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const PlaceholderProfileSchema = new mongoose.Schema(
  {
    users: {
      type: [PlaceholderProfileUserSchema],
      default: [],
    },

    instagramHandle: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "deleted"],
      default: "pending",
    },
  },
  { timestamps: true },
);

// unique only when status is pending or active
PlaceholderProfileSchema.index(
  { instagramHandle: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "active"] },
    },
  },
);

module.exports = mongoose.model("PlaceholderProfile", PlaceholderProfileSchema);
