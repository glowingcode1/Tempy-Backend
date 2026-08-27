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
      type: [String],
      default: [],
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobType",
      required: true,
    },
    isSpecial: {
      type: Boolean,
      default: false,
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
const Job = mongoose.model("Job", JobSchema);

module.exports = Job;
