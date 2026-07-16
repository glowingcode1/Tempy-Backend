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
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
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
