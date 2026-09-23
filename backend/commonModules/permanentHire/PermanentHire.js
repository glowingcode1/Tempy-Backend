const mongoose = require("mongoose");

/*
 * A care home hiring an agency worker or solo nurse permanently, after the
 * agreed number of shifts and for a fee. Home care company staff can't be
 * hired this way.
 */
const PermanentHireSchema = new mongoose.Schema(
  {
    // the care home hiring
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // the agency the worker came through, or the solo nurse themselves
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    supplierType: {
      type: String,
      enum: ["agency", "nurse"],
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Snapshots taken when the request was made.
    shiftsWorked: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

PermanentHireSchema.index({ customer: 1, worker: 1, status: 1 });

module.exports = mongoose.model("PermanentHire", PermanentHireSchema);
