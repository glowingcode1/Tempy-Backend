const { USER_TYPES, GENDER_TYPES } = require("@UsersModel");
const { LocationSchema } = require("../../../shared/locations/locationSchmea");
const mongoose = require("mongoose");

const ContactDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    relationship: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/*
 * A phone number to alert a set time before each of the job's shifts starts.
 * Set from job details by the job owner; nobody else sees it.
 */
const AlertSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    phoneNumber: {
      code: { type: String, trim: true, default: "" }, // "+44"
      number: { type: String, trim: true, default: "" }, // "7700900123"
    },
    hoursBefore: { type: Number, min: 0, default: 0 },
    minutesBefore: { type: Number, min: 0, max: 59, default: 0 },
    // Alerts already sent, one per shift start. Keyed by start time too, so
    // moving a shift re-arms its alert.
    sent: {
      type: [
        {
          _id: false,
          shift: { type: mongoose.Schema.Types.ObjectId },
          startsAt: { type: Date },
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const JobSchema = new mongoose.Schema(
  {
    location: {
      type: LocationSchema,
      required: true,
    },
    image: {
      type: String,
      default: "",
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },
    // Individual users ("user") have saved addresses instead of branches.
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    instructions: {
      type: String,
      trim: true,
      default: "",
    },
    contactDetails: {
      type: ContactDetailsSchema,
      default: () => ({}),
    },
    emergencyContact: {
      type: EmergencyContactSchema,
      default: () => ({}),
    },
    documents: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      // Registered as JobRole - there is no JobType model.
      ref: "JobRole",
      required: true,
    },
    isSpecial: {
      type: Boolean,
      default: false,
    },
    isReviewed: {
      type: Boolean,
      default: false,
    },
    alert: {
      type: AlertSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted", "completed"],
      default: "active",
      index: true,
    },
    gender: {
      type: String,
      enum: GENDER_TYPES,
      default: "Other",
      index: true,
    },
    shift: [
      {
        allowedPersons: { type: Number, default: 1 },
        date: { type: Date },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
        status: {
          type: String,
          enum: ["pending", "booked", "completed"],
          default: "pending",
        },
        isBreak: { type: Boolean, default: false },
        breakMin: { type: Number, default: 0 },
        isBiddingAllowed: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true },
);
JobSchema.index({ location: "2dsphere" });
JobSchema.index({ "alert.enabled": 1, status: 1 });
const Job = mongoose.model("Job", JobSchema);

module.exports = Job;
