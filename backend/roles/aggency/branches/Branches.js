const mongoose = require("mongoose");
const { LocationSchema } = require("../../../shared/locations/locationSchmea");
const BranchesSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      default: "",
      required: true,
    },
    location: {
      type: LocationSchema,
      default: {},
    },
    bio: {
      type: String,
      default: "",
      required: true,
    },

    profileIcon: {
      type: String,
      default: "",
    },
    cqc: {
      registrationNumber: { type: String, default: "" },
      certificate: { type: String, default: "" }, // doc path/URL
      verified: { type: Boolean, default: false },
    },
    insurance: {
      certificate: { type: String, default: "" }, // doc path/URL
      verified: { type: Boolean, default: false },
      expiryDate: { type: Date },
    },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted", "pending"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);
BranchesSchema.index(
  { user: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $ne: "deleted" },
    },
  },
);

const Branches = mongoose.model("Branches", BranchesSchema);

module.exports = Branches;
