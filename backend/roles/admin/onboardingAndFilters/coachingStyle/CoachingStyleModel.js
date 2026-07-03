const mongoose = require("mongoose");

const coachingStyleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  { timestamps: true }
);

const CoachingStyle = mongoose.model("coachingStyles", coachingStyleSchema);

module.exports = CoachingStyle;
