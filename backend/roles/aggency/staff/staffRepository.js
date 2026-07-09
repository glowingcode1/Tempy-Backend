const Staff = require("./Staff");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  getUserAndShift,
  findJobById_,
} = require("../../careHome/job/jobRepository");

const createStaff = async (data) => {
  try {
    const existingStaff = await Staff.findOne({
      email: data.email,
    });
    if (existingStaff) {
      return { error: "Staff_already_exists" };
    }
    const staff = new Staff(data);
    await staff.save();
    return staff;
  } catch (err) {
    throw err;
  }
};

const getStaff = async ({
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
      from: "users",
      let: { userId: "$staff" },
      pipeline: [
        {
          $match: {
            ...(status && { "accountState.status": status }),
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
            verificationStatus: 1,
            accountState: 1,
          },
        },
      ],
      as: "staff",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$staff",
      preserveNullAndEmptyArrays: true,
    },
  });
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Staff.schema }],
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

  const result = await Staff.aggregate(pipeline);

  const staff = result[0]?.data || [];

  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, pending, inactive, deleted, left] =
    await Promise.all([
      Staff.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Staff.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Staff.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "left",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.StaffCount = {
    total,
    active,
    pending,
    inactive,
    left,
    deleted,
  };

  return {
    staff,
    meta,
  };
};

const getStaffByJob = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  job,
  skip,
  shift,
}) => {
  const pipeline = [];
  if (job) {
    pipeline.push({
      $match: {
        job: new mongoose.Types.ObjectId(job),
      },
    });
  }
  if (shift) {
    pipeline.push({
      $match: {
        "shift._id": new mongoose.Types.ObjectId(shift),
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
      from: "users",
      let: { userId: "$jobCreater" },
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
      as: "jobCreater",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$jobCreater",
      preserveNullAndEmptyArrays: true,
    },
  });
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Staff.schema }],
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
  

  const result = await Staff.aggregate(pipeline);

  const Staff = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(job && { job: new mongoose.Types.ObjectId(job) }),
    ...(shift && { "shift._id": new mongoose.Types.ObjectId(shift) }),
  };

  const [total, active, pending, inactive, deleted, withdraw] =
    await Promise.all([
      Staff.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Staff.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Staff.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Staff.countDocuments({
        ...countFilter,
        status: "withdraw",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.StaffCount = {
    total,
    active,
    pending,
    inactive,
    withdraw,
    deleted,
  };

  return { jobStaffs: Staff, meta };
};

const findStaffById = async (id) => {
  return Staff.findById(id).lean().populate("user", "name email profileIcon");
};
const findStaffById_ = async (id) => {
  return Staff.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Staff.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteStaff = async (id) => {
  return await Staff.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};
module.exports = {
  createStaff,
  getStaff,
  findStaffById,
  getUserAndShift,
  findByIdAndUpdate,
  deleteStaff,
  findStaffById_,
  findJobById_,
  getStaffByJob,
};
