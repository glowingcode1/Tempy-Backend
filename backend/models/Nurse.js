const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const { ProvideServicesToSchema } = require("./provideServicesToSchema");
const nurseSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  },
  summary: {
    type: String,
    default: "",
  },
  taxNumber: {
    type: String,
    required: true,
  },
  governmentIdentity: [
    {
      type: String,
      required: true,
    },
  ],
  degree: [
    {
      type: String,
      required: true,
    },
  ],
  certification: [
    {
      type: String,
      required: true,
    },
  ],
  provideServicesTo: {
    type: ProvideServicesToSchema,
    default: () => ({}),
  },
});

const Nurse = User.discriminator("nurse", nurseSchema);
module.exports = Nurse;
