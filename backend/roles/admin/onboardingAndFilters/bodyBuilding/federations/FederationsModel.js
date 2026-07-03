const mongoose = require("mongoose");

const federationsSchema = new mongoose.Schema(
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

const Federations = mongoose.model("bodyBuildingFederations", federationsSchema);

module.exports = Federations;
