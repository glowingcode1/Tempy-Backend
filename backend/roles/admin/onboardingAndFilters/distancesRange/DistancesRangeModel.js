const mongoose = require("mongoose");

const distanceRangeSchema = new mongoose.Schema(
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

const DistanceRanges = mongoose.model("distanceRanges", distanceRangeSchema);

module.exports = DistanceRanges;
