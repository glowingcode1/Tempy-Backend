const Branches = require("./Branches");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");

const createBranch = async (data) => {
  try {
    const existingBranch = await Branches.findOne({
      user: data.user,
      name: data.name,
      status: { $ne: "deleted" },
    });

    if (existingBranch) {
      return {
        error: "Branch_already_exists_for_this_user_with_this_name",
      };
    }

    const branch = await Branches.create(data);

    return branch;
  } catch (err) {
    throw err;
  }
};

const getBranch = async ({ page, limit, keyword, status, user, skip }) => {
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

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Branches.schema }],
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

  const result = await Branches.aggregate(pipeline);

  const branch = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, deleted] = await Promise.all([
    Branches.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "active",
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "inactive",
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "deleted",
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.BranchCount = {
    total,
    active,
    inactive,
    deleted,
  };

  return {
    branch,
    meta,
  };
};

const getBranchSummary = async ({ page, limit, keyword, status, user, skip }) => {
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

  const result = await Branches.aggregate(pipeline);

  const branch = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, deleted] = await Promise.all([
    Branches.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "active",
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "inactive",
    }),
    Branches.countDocuments({
      ...countFilter,
      status: "deleted",
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.BranchCount = {
    total,
    active,
    inactive,
    deleted,
  };

  return {
    branch,
    meta,
  };
};



const findBranchById = async (id) => {
  return Branches.findById(id)
    .lean()
    .populate("user", "name email profileIcon userType");
};

const findBranchById_ = async (id, projection = null) => {
  return Branches.findById(id, projection);
};

const findByIdAndUpdate = async (id, data) => {
  return Branches.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon userType");
};

const deleteBranch = async (id) => {
  return await Branches.findByIdAndUpdate(
    id,
    { status: "deleted" },
    { new: true },
  );
};

const findDuplicateBranch = async ({ user, name, excludeId }) => {
  return Branches.findOne({
    _id: {
      $ne: excludeId,
    },
    user,
    name,
    status: {
      $ne: "deleted",
    },
  });
};

module.exports = {
  createBranch,
  getBranch,
  findBranchById,
  findBranchById_,
  findByIdAndUpdate,
  deleteBranch,
  findDuplicateBranch,
  getBranchSummary,
};
