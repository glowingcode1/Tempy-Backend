const mongoose = require("mongoose");

const experienceLevelSchema = new mongoose.Schema(
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

const ExperienceLevels = mongoose.model("experienceLevels", experienceLevelSchema);

module.exports = ExperienceLevels;
