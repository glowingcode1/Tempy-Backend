const mongoose = require("mongoose");

const specialtySchema = new mongoose.Schema(
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

const Specialties = mongoose.model("specialities", specialtySchema);

module.exports = Specialties;
