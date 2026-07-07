const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");
const localAuthoritySchema = new mongoose.Schema({
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
});

const LocalAuthority = User.discriminator("localAuthority", localAuthoritySchema);
module.exports = LocalAuthority;
