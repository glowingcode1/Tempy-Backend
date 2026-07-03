const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const { User } = require("./UserModel"); // ✅ named import

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
    validationDocument: [{
        type: String,
    }],
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

const CareHome = User.discriminator("careHome", careHomeSchema);

module.exports = CareHome; // ✅ export it