const mongoose = require("mongoose");
const reviewSchema = new mongoose.Schema(
  {
    reviewType: {
      type: String,
      enum: ["user", "booking"],
      required: true,
    },
    objectType: {
      type: String,
      enum: ["User", "Booking"],
      required: true,
    },
    object: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "objectType",
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bookings",
      default: null,
    },
    subject: {// current user
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    objectUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

reviewSchema.index({ bookingId: 1, subject: 1, object: 1 }, { unique: true });
reviewSchema.index({ reviewType: 1, object: 1, createdAt: -1 });

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);

module.exports = Review;
