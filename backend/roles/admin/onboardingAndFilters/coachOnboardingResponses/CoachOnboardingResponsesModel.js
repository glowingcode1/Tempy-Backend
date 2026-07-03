const mongoose = require("mongoose");
const { LocationSchema } = require("../../../../shared/locations/locationSchmea");

const coachOnboardingResponses = new mongoose.Schema(
  {

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    gender: {
      type: String,
      enum: ["", "Male", "Female", "Other"],
      default: "",
    },
    about: {
      type: String,
      default: "",
    },

    location: {
      type: LocationSchema,
      default: {
        type: "Point",
        coordinates: [0, 0], // VALID but meaningless
      },
    },

    credentials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "credentials",
      },
    ],
    bodyBuilding: {
      federations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "bodyBuildingFederations",
        },
      ],
      divisions: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "bodyBuildingDivisions",
        },
      ],
    },
    powerLifting: {
      federations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "powerLiftingFederations",
        },
      ],
      divisions: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "powerLiftingDivisions",
        },
      ],
    },
     athleteTypes: [
      {
        type: mongoose.Schema.Types.String,
        ref: "athleteTypes",
      },
    ],
    specialities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "specialities",
      },
    ],
    coachingStyle: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "coachingStyles",
      },
    ],
    priceRange: {
      min: {
        type: Number,
        default: 0,
      },
      max: {
        type: Number,
        default: 0,
      },
    },
    coachingModality: {
      inPerson: {
        isActive: {
          type: Boolean,
          default: false,
        },
        timezones: [
          {
            type: mongoose.Schema.Types.String,
            ref: "timezones",
          },
        ],
      },
      onlineOnly: {
        isActive: {
          type: Boolean,
          default: true,
        },
        timezones: [
          {
            type: mongoose.Schema.Types.String,
            ref: "timezones",
          },
        ],
      },
      hybrid: {
        isActive: {
          type: Boolean,
          default: false,
        },
        timezones: [
          {
            type: mongoose.Schema.Types.String,
            ref: "timezones",
          },
        ],
      },
    },
    socialLinks: {
      instagram: {
        type: String,
        default: "",
      },
      tikTok: {
        type: String,
        default: "",
      },
      youtube: {
        type: String,
        default: "",
      },
      website: {
        type: String,
        default: "",
      },
    },

    acceptingWork: {
      type: Boolean,
      default: true,
    },
    lookingForCoach: {
      type: Boolean,
      default: true,
    },
    portfolio: {
      type: [String],
      default: []
    },
    experienceLevels: [
      {
        type: mongoose.Schema.Types.String,
        ref: "experienceLevels",
      },
    ],

    //check onboarding completed
    isOnboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const CoachOnboardingResponses = mongoose.model("coachOnboardingResponses", coachOnboardingResponses);

module.exports = CoachOnboardingResponses;
