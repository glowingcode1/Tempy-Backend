const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");

const agencySchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["agency"],
    default: "agency",
  },
  location: {
    type: LocationSchema,
    default: {},
  },
  registrationNumber: {
    type: String,
    required: true,
  },
  validationDocument: [
    {
      type: String,
    },
  ],
  provideServicesTo: {
    careHome: {
      type: Boolean,
      default: false,
    },
    hospital: {
      type: Boolean,
      default: true,
    },
    localAuthority: {
      type: Boolean,
      default: true,
    },
    user: {
      type: Boolean,
      default: true,
    },
  },
});

let Agency;

const getAgencyModel = () => {
  if (!Agency) {
    const { User } = require("./UserModel");
    Agency = User.discriminator("agency", agencySchema);
  }
  return Agency;
};

module.exports = getAgencyModel();
