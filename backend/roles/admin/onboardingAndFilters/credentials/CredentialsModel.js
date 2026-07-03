const mongoose = require("mongoose");

const credentialsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
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

const Credentials = mongoose.model("credentials", credentialsSchema);

module.exports = Credentials;
