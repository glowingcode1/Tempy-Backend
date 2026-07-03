const { default: mongoose } = require("mongoose");

const JobRoleSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: true,
      trim: true, // e.g. "Care", "Kitchen", "Housekeeping"
    },
    title: {
      type: String,
      required: true,
      trim: true, // e.g. "Senior Care Nights", "Head Cook"
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

JobRoleSchema.index(
  { department: 1, title: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } }
);

const JobRole = mongoose.model("JobRole", JobRoleSchema);

module.exports = JobRole;
