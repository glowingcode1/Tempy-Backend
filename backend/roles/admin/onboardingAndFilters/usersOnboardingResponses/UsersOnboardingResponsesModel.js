const mongoose = require("mongoose");
const { LocationSchema } = require("../../../../shared/locations/locationSchmea");

const usersOnboardingResponses = new mongoose.Schema(
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

    preferredCoachGender: {
      type: String,
      enum: ["", "Male", "Female", "Other"],
      default: "",
    },

    competitionPlan: {
      type: String,
      enum: ["", "In prep", "<6 months", "6-12 months", "Exploratory"],
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

    experienceLevels: [
      {
        type: mongoose.Schema.Types.String,
        ref: "experienceLevels",
      },
    ],

    athleteTypes: [
      {
        type: mongoose.Schema.Types.String,
        ref: "athleteTypes",
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

//here users means Athletes
const UsersOnboardingResponsesModel = mongoose.model("usersOnboardingResponses", usersOnboardingResponses);

module.exports = UsersOnboardingResponsesModel;