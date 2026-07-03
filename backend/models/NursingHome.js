const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const nursingHomeSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  }
});

const NursingHome = User.discriminator("nursingHome", nursingHomeSchema);
module.exports = NursingHome;
