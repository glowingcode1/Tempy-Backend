const mongoose = require("mongoose");
const { LocationSchema } = require("../shared/locations/locationSchmea");
const {User} = require("./UserModel");
const employeeSchema = new mongoose.Schema({
  location: {
    type: LocationSchema,
    default: {},
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

const Employee = User.discriminator("employee", employeeSchema);
module.exports = Employee;