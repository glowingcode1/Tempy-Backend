const Job = require("./Job");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const { findUserById } = require("../../../roles/admin/usersManagement/usersRepository");

const createJob = async (data) => {
  try {
    const job = new Job(data);
    await job.save();
    return job;
  } catch (err) {
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
}) => {
  const provideServicesToUser = await findUserById(requester);
  // Permission object on the requester, e.g.
  // { careHome: false, careHomes: true, hospitals: true, ... }
  const servicePermissions = provideServicesToUser?.provideServicesTo || {};
  // Keep only the userTypes whose permission is true
  const allowedUserTypes = Object.keys(servicePermissions).filter(
    (key) => servicePermissions[key] === true,
  );
  const pipeline = [];
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
      },
    });
  }

  if (status) {
    pipeline.push({
      $match: {
        status,
      },
    });
  } else {
    pipeline.push({
      $match: {
        status: { $ne: "deleted" },
      },
    });
  }
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$_id", "$$userId"],
            },
          },
        },
        {
          $project: {
            name: 1,
            email: 1,
            profileIcon: 1,
            accountState: 1,
          },
        },
      ],
      as: "user",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$user",
      preserveNullAndEmptyArrays: true,
    },
  });
  // Only show jobs whose owner's userType the requester is permitted to see
  pipeline.push({
    $match: {
      "user.accountState.userType": { $in: allowedUserTypes },
    },
  });

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Job.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({
        $match: keywordMatch,
      });
    }
  }

  pipeline.push({
    $sort: {
      createdAt: -1,
    },
  });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [
        {
          $count: "count",
        },
      ],
    },
  });

  const result = await Job.aggregate(pipeline);

  const Jobs = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, deleted] = await Promise.all([
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
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.JobsCount = {
    total,
    active,
    inactive,
    deleted,
  };

  return {
    Jobs,
    meta,
  };
};;

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
  return { user: job.user, shift: shift || null,_id: shift ? shift._id : null };
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
