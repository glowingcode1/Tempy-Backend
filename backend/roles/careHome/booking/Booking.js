const mongoose = require("mongoose");
const { DEFAULT_CURRENCY } = require("@helperUtils/constants");

/* ---------------------------------------------
   Shift snapshot — copied from the job's shift
   at approval time so later edits to the job
   never change what was agreed.
---------------------------------------------- */
const shiftSnapshotSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId, // the _id of the shift inside job.shift[]
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String, // "08:00"
      required: true,
    },
    endTime: {
      type: String, // "14:06"
      required: true,
    },
    isBreak: {
      type: Boolean,
      default: false,
    },
    breakMin: {
      type: Number, // minutes to subtract from total hours
      default: 0,
    },
  },
  { _id: false },
);

/* ---------------------------------------------
   Payment sub-schema — lives inside the booking.
   If you later integrate Stripe/PayPal, the
   transactionId + gateway fields cover it.
---------------------------------------------- */
const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number, // agreed hourly rate (from the approved bid)
      required: true,
    },
    type: {
      type: String,
      enum: ["hourly", "fixed"],
      default: "hourly",
    },
    currency: {
      type: String,
      default: DEFAULT_CURRENCY,
    },
    totalHours: {
      type: Number, // from shift start/end minus break
      default: 0,
    },
    perHour: {
      type: Number,
      default: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    amountPayedToWorker: {
      type: Number,
      default: 0,
    },
    amountPayedToEmployer: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "refunded", "failed"],
      default: "pending",
    },
    method: {
      type: String,
      enum: ["card", "bank", "wallet", "cash", "other"],
      default: "card",
    },
    gateway: {
      type: String, // "stripe", "paypal", etc.
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

/* ---------------------------------------------
   Attendance sub-schema — check-in / check-out
---------------------------------------------- */
const attendanceSchema = new mongoose.Schema(
  {
    checkIn: {
      type: Date,
      default: null,
    },
    checkOut: {
      type: Date,
      default: null,
    },
    proofPicture: {
      type: String, // URL to the picture taken at check-in
      default: "",
    },
    signature: {
      type: String, // URL to the signature image taken at check-out
      default: "",
    },
    checkInLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lat, lng]
        default: [0, 0],
      },
    },
    checkOutLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  { _id: false },
);

/* ---------------------------------------------
   Booking schema
---------------------------------------------- */
const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId, // the user who created the booking (care home)
      ref: "User",
      required: true,
    },
    // ---- references ----
    bid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId, // the user whose bid was approved
      ref: "User",
      required: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId, // job.user (care home) — denormalized
      ref: "User",
      default: null,
    },

    shift: {
      type: shiftSnapshotSchema,
      required: true,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ---- lifecycle ----
    status: {
      type: String,
      enum: [
        "pending", // approved, shift not started yet
        "active", // accepted by worker, shift not started yet
        "inProgress", // worker checked in
        "completed", // worker checked out / shift done
        "cancelledByWorker",
        "cancelledByEmployer",
        "cancelledByUser",
      ],
      default: "pending",
      index: true,
    },
    cancellation: {
      reason: { type: String, default: "" },
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      cancelledAt: { type: Date, default: null },
    },

    // ---- attendance + payment ----
    attendance: {
      type: attendanceSchema,
      default: () => ({}),
    },
    payment: {
      type: paymentSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

/* ---------------------------------------------
   Indexes
---------------------------------------------- */

// common list queries
bookingSchema.index({ worker: 1, status: 1, "shift.date": 1 });
bookingSchema.index({ employer: 1, status: 1, "shift.date": 1 });
bookingSchema.index({ job: 1 });

bookingSchema.index({
  "attendance.checkInLocation": "2dsphere",
});

bookingSchema.index({
  "attendance.checkOutLocation": "2dsphere",
});
bookingSchema.index({
  "snapshot.location": "2dsphere",
});
const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
