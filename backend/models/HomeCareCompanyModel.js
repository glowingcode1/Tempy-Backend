const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const { ProvideServicesToSchema } = require("./provideServicesToSchema");



const HomeCareCompanySchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["residentialCareHome"],
    default: "residentialCareHome",
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
    default: () => ({}),
  },
});

const HomeCareCompany = User.discriminator(
  "homeCareCompany",
  HomeCareCompanySchema,
);

module.exports = HomeCareCompany; 