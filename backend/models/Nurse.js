const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const { ProvideServicesToSchema } = require("./provideServicesToSchema");
const nurseSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  },
  taxNumber: {
    type: String,
    default: "",
  },
  governmentIdentity: [
    {
      type: String,
      default: [],
    },
  ],
  degree: [
    {
      type: String,
      default: [],
    },
  ],
  certification: [
    {
      type: String,
      default: [],
    },
  ],
  provideServicesTo: {
    type: ProvideServicesToSchema,
    default: () => ({}),
  },
});

const Nurse = User.discriminator("nurse", nurseSchema);
module.exports = Nurse;
