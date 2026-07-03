const mongoose = require("mongoose");

const athleteTypesSchema = new mongoose.Schema(
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

const AthleteTypes = mongoose.model("athleteTypes", athleteTypesSchema);

module.exports = AthleteTypes;
