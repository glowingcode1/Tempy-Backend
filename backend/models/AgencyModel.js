const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const {
  ProvideServicesToSchema,
} = require("./provideServicesToSchema");

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
    type: ProvideServicesToSchema,
    default: () => ({
      careHome: false,
      hospital: true,
      localAuthority: true,
      user: true,
    }),
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
