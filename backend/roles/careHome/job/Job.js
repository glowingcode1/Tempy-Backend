const { USER_TYPES, GENDER_TYPES } = require("@UsersModel");
const { LocationSchema } = require("../../../shared/locations/locationSchmea");
const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    location: {
      type: LocationSchema,
      required: true,
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
      required: true,
    },  
    description: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobType",
      required: true,},
    status: {
      type: String,
      enum: ["active", "inactive", "deleted","completed"],
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
        status: {
          type: String,
          enum: ["pending","booked","completed"],
          default: "pending",
        },
        isBreak: {
          type: Boolean,
          default: false,
        },
        breakMin: {
          type: Number,
          default: 0,
        },
        isBiddingAllowed: {
          type: Boolean,
          default: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);
JobSchema.index({ location: "2dsphere" });
const Job = mongoose.model("Job", JobSchema);


module.exports = Job;
