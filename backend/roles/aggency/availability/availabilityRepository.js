const { mongoose } = require("mongoose");
const Availability = require("./Availability");
const { generateMeta } = require("@helperUtils/responseUtil");

const USER_PROJECTION = {
  name: 1,
  email: 1,
  profileIcon: 1,
  accountState: 1,
};

const AVAILABILITY_STATUSES = Availability.schema.path("status").enumValues;

const toObjectIds = (ids) =>
  (Array.isArray(ids) ? ids : [ids]).map(
    (id) => new mongoose.Types.ObjectId(String(id)),
  );

/*
 * Entries of these users that fall in the window. An entry counts when any
 * part of it is inside, not only its start: leave that began last week and
 * runs into this one is still leave this week.
 */
const buildScopeFilter = ({ users, startDate, endDate }) => {
  const filter = { user: { $in: toObjectIds(users) } };
  if (startDate) filter.endDateTime = { $gte: new Date(startDate) };
  if (endDate) filter.startDateTime = { $lte: new Date(endDate) };
  return filter;
};

// One count per status in the schema enum (zero when none), plus total.
const countByStatus = async (filter) => {
  const rows = await Availability.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts = Object.fromEntries(AVAILABILITY_STATUSES.map((s) => [s, 0]));
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { total, ...counts };
};

const createAvailability = async (data) => {
  const overlapping = await findOverlappingAvailability(data);

  if (overlapping) {
    return { error: "Availability_overlaps_with_existing_entry" };
  }

  return Availability.create(data);
};

const listAvailability = async ({
  page,
  limit,
  status,
  users,
  startDate,
  endDate,
  skip,
  withUsers,
}) => {
  const scope = buildScopeFilter({ users, startDate, endDate });

  const pipeline = [{ $match: { ...scope, ...(status && { status }) } }];

  if (withUsers) {
    for (const field of ["user", "creator"]) {
      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: field,
            foreignField: "_id",
            pipeline: [{ $project: USER_PROJECTION }],
            as: field,
          },
        },
        { $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: true } },
      );
    }
  }

  pipeline.push(
    { $sort: { startDateTime: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    },
  );

  // Counts cover the same users and window, across every status.
  const [result, counts] = await Promise.all([
    Availability.aggregate(pipeline),
    countByStatus(scope),
  ]);

  const availability = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);
  meta.AvailabilityCount = counts;

  return { availability, meta };
};

const getAvailability = (params) =>
  listAvailability({ ...params, withUsers: true });

const getAvailabilitySummary = (params) =>
  listAvailability({ ...params, withUsers: false });

const findAvailabilityById_ = async (id, projection = null) => {
  return Availability.findById(id, projection);
};

const findByIdAndUpdate = async (id, data) => {
  return Availability.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon userType")
    .populate("creator", "name email profileIcon userType");
};

const deleteAvailability = async (id) => {
  return await Availability.findByIdAndDelete(id);
};

const findOverlappingAvailability = async ({
  user,
  startDateTime,
  endDateTime,
  excludeId,
}) => {
  return Availability.findOne({
    ...(excludeId && { _id: { $ne: excludeId } }),
    user,
    startDateTime: { $lt: endDateTime },
    endDateTime: { $gt: startDateTime },
  });
};

module.exports = {
  AVAILABILITY_STATUSES,
  createAvailability,
  getAvailability,
  findAvailabilityById_,
  findByIdAndUpdate,
  deleteAvailability,
  findOverlappingAvailability,
  getAvailabilitySummary,
};
