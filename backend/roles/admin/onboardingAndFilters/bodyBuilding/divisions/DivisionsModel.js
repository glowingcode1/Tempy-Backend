const mongoose = require("mongoose");

const divisionsSchema = new mongoose.Schema(
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

const Divisions = mongoose.model("bodyBuildingDivisions", divisionsSchema);

module.exports = Divisions;
