const mongoose = require("mongoose");

/* ---------------------------------------------
   Shift snapshot — copied from the job's shift
   at approval time so later edits to the job
   never change what was agreed.
---------------------------------------------- */
const shiftSnapshotSchema = new mongoose.Schema(
  {
    shift: {
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
      type: Number,
      default: 0,
    }
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
    Type: {
      type: String,
      enum: ["hourly", "fixed"],
      default: "hourly",
    },
    currency: {
      type: String,
      default: "USD",
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
        type: [Number], // [lng, lat]
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
    // ---- references ----
    bid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
      required: true,
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
      required: true,
    },

    // ---- agreed shift (snapshot, not a ref) ----
    shift: {
      type: shiftSnapshotSchema,
      required: true,
    },

    // ---- lifecycle ----
    status: {
      type: String,
      enum: [
        "pending", // approved, shift not started yet
        "inProgress", // worker checked in
        "completed", // worker checked out / shift done
        "cancelledByWorker",
        "cancelledByEmployer",
        "noShow", // worker never checked in
        "disputed",
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
      required: true,
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

/* ---------------------------------------------
   Helpers
---------------------------------------------- */

// compute actual hours on check-out
bookingSchema.methods.finalizeHours = function () {
  const { checkIn, checkOut } = this.attendance || {};
  if (checkIn && checkOut) {
    let mins = (checkOut - checkIn) / 60000;
    if (this.shift.isBreak) mins -= this.shift.breakMin || 0;
    this.payment.actualHours = Math.max(0, +(mins / 60).toFixed(2));
    if (this.payment.rateType === "hourly") {
      this.payment.subTotal = +(
        this.payment.actualHours * this.payment.rate
      ).toFixed(2);
      this.payment.totalAmount = +(
        this.payment.subTotal + (this.payment.platformFee || 0)
      ).toFixed(2);
    }
  }
  return this;
};

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
