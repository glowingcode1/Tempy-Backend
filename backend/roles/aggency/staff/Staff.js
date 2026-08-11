const { GENDER_TYPES } = require("@UsersModel");
const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema(
  {
    // the employer this staff record belongs to
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    phoneNumber: {
      code: {
        // Country code for phone number
        type: String,
        default: "",
      },
      number: {
        // Phone number without country code
        type: String,
        default: "",
      },
      default: {},
    },
    dob: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: GENDER_TYPES,
      default: "Other",
    },
    email: {
      type: String,
      required: true,
    },
    speciality: {
      type: String,
      enum: [
        "generalNurse",
        "mentalHealth",
        "elderlyCare",
        "learningDisability",
        "pediatric",
        "healthcareAssistant",
        "supportWorker",
      ],
      required: true,
    },
    ratePerHour: {
      type: Number,
      required: true,
      default: 1,
    },
    platformPercent: {
      type: Number,
      default: 0, // your cut → staff keeps 100%
    },
    status: {
      type: String,
      enum: ["pending", "inactive", "active", "deleted", "left"],
      default: "pending",
    },
  },
  { timestamps: true },
);
// one record per employer↔staff pairing
StaffSchema.index({ user: 1, staff: 1 }, { unique: true });

const Staff = mongoose.model("Staff", StaffSchema);

module.exports = Staff;
