const JobRole = require("./JobRole");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");


const createJobRole = async (data) => {
  try {
    const existingJobRole = await JobRole.findOne({
      department: (data.department),
     title :(data.title),
     status: { $ne: "deleted" },
    });
    if (existingJobRole) {
      return { error: "job_rol_already_exists" };
    }
    const jobRole = new JobRole(data);
    await jobRole.save();
    return jobRole;
  } catch (err) {
    throw err;
  }
};

const getJobRole = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  skip,
}) => {
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

    pipeline.push({
      $lookup: {
        from: "jobroles",
        localField: "type",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              department: 1,
              title: 1,
              status: 1,
            },
          },
        ],
        as: "type",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$type",
        preserveNullAndEmptyArrays: true,
      },
    });

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: JobRole.schema }],
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

  const result = await JobRole.aggregate(pipeline);

  const jobRole = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active,  inactive, deleted] =
    await Promise.all([
      JobRole.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      JobRole.countDocuments({
        ...countFilter,
        status: "active",
      }),


      JobRole.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      JobRole.countDocuments({
        ...countFilter,
        status: "deleted",
      }),

    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.JobRoleCount = {
    total,
    active,
    inactive,
    deleted,
  };

  return {
    jobRole,
    meta,
  };
};

const findJobRoleById = async (id) => {
  return JobRole.findById(id).lean().populate("user", "name email profileIcon");
};
const findJobRoleById_ = async (id) => {
  return JobRole.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return JobRole.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteJobRole = async (id) => {
  return await JobRole.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};
module.exports = {
  createJobRole,
  getJobRole,
  findJobRoleById,
  findByIdAndUpdate,
  deleteJobRole,
  findJobRoleById_,
};
