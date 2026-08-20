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
  taxNumber: {
    type: String,
    required: true,
  },
});

let userDescriminatorModel;

const getUserDescriminatorModel = () => {
  if (!userDescriminatorModel) {
    const { User } = require("./UserModel");
    userDescriminatorModel = User.discriminator(
      "userDescriminator",
      userDescriminatorSchema,
    );
  }
  return userDescriminatorModel;
};

module.exports = getUserDescriminatorModel;
