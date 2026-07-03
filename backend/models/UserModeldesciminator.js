const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");

const userDescriminatorSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  },
  governmentIdentity: [
    {
      type: String,
      required: true,
    },
  ],
  provideServicesTo: {
    careHome: {
      type: Boolean,
      default: true,
    },
    hospitals: {
      type: Boolean,
      default: false,
    },
    localAuthorities: {
      type: Boolean,
      default: false,
    },
    nursingHomes: {
      type: Boolean,
      default: false,
    },
    employee: {
      type: Boolean,
      default: false,
    },
  },
});


let userDescriminatorModel;

const getUserDescriminatorModel = () => {
  if (!userDescriminatorModel) {
    const { User } = require("./UserModel");
    userDescriminatorModel = User.discriminator("userDescriminator", userDescriminatorSchema);
  }
  return userDescriminatorModel;
};

module.exports = getUserDescriminatorModel;
