const mongoose = require("mongoose");
const AvailabilitySchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["active", "busy", "onCall", "sleepover", "dayOff", "leave"],
      default: "active",
      index: true,
    },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
  },
  { timestamps: true },
);
module.exports = mongoose.model("Availability", AvailabilitySchema);
