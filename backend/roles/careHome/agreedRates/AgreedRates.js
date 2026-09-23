const mongoose = require("mongoose");

/*
 * Loaded for its side effect: it registers the JobRole model. The update
 * endpoint populates jobType, and populate resolves the ref by name at call
 * time, so the model has to exist by then rather than depending on some other
 * route happening to load it first.
 */
require("../../admin/jobRole/JobRole");

const USER_TYPES = ["agency", "homeCareCompany", "nurse"];

const AgreedRateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobType: {
      type: mongoose.Schema.Types.ObjectId,
      // The model is registered as JobRole (collection jobroles). There has
      // never been a JobType model, so populating this ref threw.
      ref: "JobRole",
      required: true,
    },
    objectType: {
      type: String,
      enum: USER_TYPES,
      index: true,
    },
    objectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rateType: {
      type: String,
      enum: ["hourly", "fixed"],
      required: true,
      default: "hourly",
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    autoAssign: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);
// Partial indexes do not accept $ne, so the live statuses are listed instead.
AgreedRateSchema.index(
  { user: 1, objectId: 1, jobType: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["active", "inactive"] } },
  },
);
const AgreedRate = mongoose.model("AgreedRate", AgreedRateSchema);

/*
 * The index used to be declared on "JobType", a field that does not exist, so
 * if it was ever built it indexed every rate as null and allowed only one rate
 * per partner. Mongoose never drops old indexes, so it is removed here; when
 * it does not exist the error is ignored.
 */
mongoose.connection
  .asPromise()
  .then(() => AgreedRate.collection.dropIndex("user_1_objectId_1_JobType_1"))
  .catch(() => {});

module.exports = AgreedRate;
