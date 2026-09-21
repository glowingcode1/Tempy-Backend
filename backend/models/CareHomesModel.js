const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel");

const careHomeSchema = new mongoose.Schema({
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

const CareHome = User.discriminator("careHome", careHomeSchema);

module.exports = CareHome;
