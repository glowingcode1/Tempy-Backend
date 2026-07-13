const Job = require("./Job");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  findUserById,
} = require("../../../roles/admin/usersManagement/usersRepository");

const createJob = async (data) => {
  try {
    const job = new Job(data);
    await job.save();
    return job;
  } catch (err) {
    ``;
    throw err;
  }
};

const getJobs = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  skip,
  userType,
  requester,
  latitude, // user's latitude
  longitude, // user's longitude
  km, // radius in kilometers
}) => {
  const provideServicesToUser = await findUserById(requester);
  const servicePermissions = provideServicesToUser?.provideServicesTo || {};
  const allowedUserTypes = Object.keys(servicePermissions).filter(
    (key) => servicePermissions[key] === true,
  );

  const pipeline = [];

  // Base filters shared by both geo and non-geo modes
  const baseMatch = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(status ? { status } : { status: { $ne: "deleted" } }),
  };

  const hasGeo =
    latitude != null &&
    longitude != null &&
    km != null &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude)) &&
    !isNaN(Number(km));

  if (hasGeo) {
    // $geoNear MUST be the first stage; filters go inside `query`
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(longitude), Number(latitude)], // [lng, lat]
        },
        key: "location",
        distanceField: "distanceInMeters", // distance added to each job
        spherical: true,
        maxDistance: Number(km) * 1000, // km -> meters
        query: baseMatch,
      },
    });
    pipeline.push({
      $addFields: {
        distanceInKm: { $round: [{ $divide: ["$distanceInMeters", 1000] }, 2] },
      },
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }

  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "user",
    },
  });

  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
  });
  pipeline.push({
    $lookup: {
      from: "jobroles",
      let: { typeId: "$type" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                "$_id",
                {
                  $convert: {
                    input: "$$typeId",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              ],
            },
          },
        },
        { $project: { department: 1, title: 1, status: 1 } },
      ],
      as: "type",
    },
  });
  pipeline.push({
    $unwind: { path: "$type", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $lookup: {
      from: "bids",
      let: { jobId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$job", "$$jobId"] } } },
        { $count: "count" },
      ],
      as: "bidsCount",
    },
  });

  pipeline.push({
    $addFields: {
      bidsCount: { $ifNull: [{ $arrayElemAt: ["$bidsCount.count", 0] }, 0] },
    },
  });
  if (allowedUserTypes.length > 0) {
    // Only show jobs whose owner's userType the requester is permitted to see
    pipeline.push({
      $match: { "user.accountState.userType": { $in: allowedUserTypes } },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Job.schema }],
      keyword,
    );
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Job.aggregate(pipeline);

  const Jobs = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, deleted] = await Promise.all([
    Job.countDocuments({ ...countFilter, status: { $ne: "deleted" } }),
    Job.countDocuments({ ...countFilter, status: "active" }),
    Job.countDocuments({ ...countFilter, status: "inactive" }),
    Job.countDocuments({ ...countFilter, status: "deleted" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.JobsCount = { total, active, inactive, deleted };

  return { Jobs, meta };
};

const findJobById = async (id) => {
  return Job.findById(id).lean().populate("user", "name email profileIcon");
};
const findJobById_ = async (id) => {
  return Job.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Job.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteJob = async (id) => {
  return await Job.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};
const getUserAndShift = async (jobId, shiftId) => {
  const job = await Job.findById(jobId).select("user shift");
  if (!job) return { user: null, shift: null };

  const shift = job.shift.id(shiftId); // Mongoose subdoc lookup by _id
  return {
    user: job.user,
    shift: shift || null,
    _id: shift ? shift._id : null,
  };
};

module.exports = {
  createJob,
  getJobs,
  findJobById,
  findByIdAndUpdate,
  deleteJob,
  findJobById_,
  getUserAndShift,
};
