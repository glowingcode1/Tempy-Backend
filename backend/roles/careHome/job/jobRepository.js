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
    if (data.worker || data.employer) {
      data.isSpecial = true;
    }
    const job = new Job(data);
    await job.save();
    return job;
  } catch (err) {
    ``;
    throw err;
  }
};
const getJobsSummary = async ({
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
  projection,
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
          coordinates: [Number(latitude), Number(longitude)], // [lat, lng]
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
        { $project: { accountState: 1 } },
      ],
      as: "user",
    },
  });

  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
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
  if (projection) {
    pipeline.push({
      $project: projection,
    });
  }
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
const getDateRange = (range) => {
  const startDate = new Date();
  const endDate = new Date();

  if (range === "next24Hours") {
    endDate.setHours(endDate.getHours() + 24);
  } else if (range === "thisWeek") {
    const day = startDate.getDay(); // 0 = Sunday
    startDate.setDate(startDate.getDate() - day);
    startDate.setHours(0, 0, 0, 0);

    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (range === "nextWeek") {
    const day = startDate.getDay();
    startDate.setDate(startDate.getDate() - day + 7);
    startDate.setHours(0, 0, 0, 0);

    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else {
    return null;
  }

  return { startDate, endDate };
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
  worker,
  employer,
  projection,
  dateFilter, // optional date range filter
}) => {
  const now = new Date();

  const addTime = (hours = 0, days = 0) =>
    new Date(now.getTime() + (hours * 60 * 60 + days * 24 * 60 * 60) * 1000);

  const getWeekRange = (weekOffset = 0) => {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - now.getDay() + weekOffset * 7);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  };

  const ranges = {
    next6Hours: { startDate: now, endDate: addTime(6) },
    next12Hours: { startDate: now, endDate: addTime(12) },
    next24Hours: { startDate: now, endDate: addTime(24) },
    next3Days: { startDate: now, endDate: addTime(0, 3) },
    next7Days: { startDate: now, endDate: addTime(0, 7) },
    thisWeek: getWeekRange(),
    nextWeek: getWeekRange(1),
  };
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
  if (dateFilter && ranges[dateFilter]) {
    pipeline.push({
      $match: {
        shift: {
          $elemMatch: {
            date: {
              $gte: ranges[dateFilter].startDate,
              $lte: ranges[dateFilter].endDate,
            },
          },
        },
      },
    });
  }

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
  const assignmentConditions = [];

  // Open jobs (both are null)
  assignmentConditions.push({
    worker: null,
    employer: null,
  });

  // Assigned jobs
  const assignedMatch = {};
  if (dateFilter && ranges[dateFilter]) {
    assignedMatch.shift = {
      $elemMatch: {
        date: {
          $gte: ranges[dateFilter].startDate,
          $lte: ranges[dateFilter].endDate,
        },
      },
    };
  }

  if (worker) {
    assignedMatch.worker = new mongoose.Types.ObjectId(worker);
  }

  if (employer) {
    assignedMatch.employer = new mongoose.Types.ObjectId(employer);
  }

  if (Object.keys(assignedMatch).length) {
    assignmentConditions.push(assignedMatch);
  }

  if (assignmentConditions.length > 0) {
    pipeline.push({
      $match: {
        $or: assignmentConditions,
      },
    });
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
      from: "reviews",
      let: { userId: "$user._id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$objectUser", "$$userId"],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            averageRating: { $avg: "$rating" },
          },
        },
      ],
      as: "reviewStats",
    },
  });

  pipeline.push({
    $addFields: {
      rating: {
        profileIcon: "$user.profileIcon",
        totalReviews: {
          $ifNull: [{ $arrayElemAt: ["$reviewStats.totalReviews", 0] }, 0],
        },
        averageRating: {
          $round: [
            {
              $ifNull: [{ $arrayElemAt: ["$reviewStats.averageRating", 0] }, 0],
            },
            1,
          ],
        },
      },
    },
  });

  pipeline.push({
    $project: {
      reviewStats: 0,
      "user.profileIcon": 0, // remove duplicate profileIcon from user
    },
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
      from: "branches",
      let: { branchId: "$branch" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                "$_id",
                {
                  $convert: {
                    input: "$$branchId",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              ],
            },
          },
        },
        { $project: { name: 1, location: 1, status: 1 } },
      ],
      as: "branch",
    },
  });
  pipeline.push({
    $unwind: { path: "$branch", preserveNullAndEmptyArrays: true },
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
  if (projection) {
    pipeline.push({
      $project: projection,
    });
  }
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

  const next24Hours = getDateRange("next24Hours");

  const thisWeek = getDateRange("thisWeek");

  const nextWeek = getDateRange("nextWeek");

  const [
    total,
    active,
    inactive,
    deleted,
    next6HoursCount,
    next12HoursCount,
    next24HoursCount,
    next3DaysCount,
    next7DaysCount,
    thisWeekCount,
    nextWeekCount,
  ] = await Promise.all([
    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
    }),

    Job.countDocuments({
      ...countFilter,
      status: "active",
    }),

    Job.countDocuments({
      ...countFilter,
      status: "inactive",
    }),

    Job.countDocuments({
      ...countFilter,
      status: "deleted",
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next6Hours.startDate,
            $lte: ranges.next6Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next12Hours.startDate,
            $lte: ranges.next12Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next24Hours.startDate,
            $lte: ranges.next24Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next3Days.startDate,
            $lte: ranges.next3Days.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next7Days.startDate,
            $lte: ranges.next7Days.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.thisWeek.startDate,
            $lte: ranges.thisWeek.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.nextWeek.startDate,
            $lte: ranges.nextWeek.endDate,
          },
        },
      },
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.JobsCount = {
    total,
    active,
    inactive,
    deleted,
    next6Hours: next6HoursCount,
    next12Hours: next12HoursCount,
    next24Hours: next24HoursCount,
    next3Days: next3DaysCount,
    next7Days: next7DaysCount,
    thisWeek: thisWeekCount,
    nextWeek: nextWeekCount,
  };

  return { Jobs, meta };
};

const findJobById = async (id) => {
  return Job.findById(id).lean().populate("user", "name email profileIcon");
};
const findJobById_ = async (id, projection = null) => {
  return Job.findById(id, projection || {});
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

const updateShiftStatus = async (jobId, shiftId, status) => {
  const allowed = ["pending", "booked", "completed"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${allowed.join(", ")}`);
  }

  const updatedJob = await Job.findOneAndUpdate(
    { _id: jobId, "shift._id": shiftId },
    { $set: { "shift.$.status": status } },
    { new: true },
  );

  if (!updatedJob) {
    throw new Error("Job or shift not found");
  }

  return updatedJob;
};

module.exports = {
  createJob,
  getJobs,
  findJobById,
  findByIdAndUpdate,
  deleteJob,
  findJobById_,
  getUserAndShift,
  getJobsSummary,
  updateShiftStatus,
};
