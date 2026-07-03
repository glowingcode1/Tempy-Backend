
const mongoose = require("mongoose");
const BidSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobCreater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    snapshot: {
      type: Object,
      default: {},
    },
    bid: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    note: {
      type: String,
      default: "",
    },
    shift: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
        required: true,
      },
      date: {
        type: Date,
        required: true,
      },
      startTime: {
        type: String,
        required: true,
      },
      endTime: {
        type: String,
        required: true,
      },
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected","deleted", "withdraw"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);
BidSchema.index({ user: 1, shift: 1 }, { unique: true });

const Bid = mongoose.model("Bid", BidSchema);

module.exports = Bid;
