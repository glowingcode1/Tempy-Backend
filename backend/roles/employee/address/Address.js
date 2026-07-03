const { LocationSchema } = require("../../../shared/locations/locationSchmea");
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    location: {
        type: LocationSchema,
        default: {},
    },
    status: { type: String, enum: ["active", "inactive", "deleted"], default: "active" },
  },
  { timestamps: true },
);

const Address = mongoose.model("Address", addressSchema);

module.exports = Address;
