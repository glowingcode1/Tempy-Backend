const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const hospitalSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  }
});

const Hospital = User.discriminator("hospital", hospitalSchema);
module.exports = Hospital;
