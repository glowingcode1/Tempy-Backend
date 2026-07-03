const { USER_TYPES, GENDER_TYPES } = require("@UsersModel");
const { LocationSchema } = require("../../../shared/locations/locationSchmea");
const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    location: {
      type: LocationSchema,
      default: {},
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
    description: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: USER_TYPES,
      default: "employee",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      index: true,
    },
    gender: {
      type: String,
      enum: GENDER_TYPES,
      default: "Other",
      index: true,
    },
    isBreak: {
      type: Boolean,
      default: false,
    },
    breakMin: {
      type: Number,
      default: 0,
    },
    shift: [
      {
        allowedPersons: {
          type: Number,
          default: 1,
        },
        date: {
          type: Date,
        },
        startTime: {
          type: String,
          default: "",
        },
        endTime: {
          type: String,
          default: "",
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

const Job = mongoose.model("Job", JobSchema);

module.exports = Job;
