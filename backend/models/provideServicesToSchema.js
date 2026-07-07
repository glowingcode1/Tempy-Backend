const mongoose = require("mongoose");

const ProvideServicesToSchema = new mongoose.Schema(
  {
    careHome: { type: Boolean, default: true },
    hospital: { type: Boolean, default: true },
    localAuthority: { type: Boolean, default: true },
    user: { type: Boolean, default: true },
  },
  { _id: false },
);

module.exports = { ProvideServicesToSchema };
