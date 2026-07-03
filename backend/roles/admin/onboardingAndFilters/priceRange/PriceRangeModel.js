const mongoose = require("mongoose");

const priceRangeSchema = new mongoose.Schema(
  {
    price: {
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

const PriceRange = mongoose.model("priceRange", priceRangeSchema);

module.exports = PriceRange;
