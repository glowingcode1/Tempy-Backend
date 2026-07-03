const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const localAuthoritySchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
  }
});

const LocalAuthority = User.discriminator("localAuthority", localAuthoritySchema);
module.exports = LocalAuthority;
