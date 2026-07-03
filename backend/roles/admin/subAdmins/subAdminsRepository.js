const { SubAdmin, FEATURE_KEYS } = require("./SubAdmins");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const { User } = require("@UsersModel");
const mongoose = require("mongoose");
const getPermissions = async ({ page = 1, limit = 20, skip = 0 }) => {
  const allPermissions = Object.keys(FEATURE_KEYS).map((key) => ({
    key,
    label: key
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  }));
  const permissions = allPermissions.slice(skip, skip + limit);
  const meta = generateMeta(page, limit, allPermissions.length);
  return {
    permissions,

    meta,
  };
};

const createSubAdmins = async (data) => {
  try {
    const subAdmin = new SubAdmin(data);
    await subAdmin.save();
    return subAdmin;
  } catch (err) {
    throw err;
  }
};

const getSubAdmins = async ({
  page,
  limit,
  keyword,
  status,
  userId,
  skip,
}) => {
  const pipeline = [];
  if (userId) {
    pipeline.push({
      $match: {
        creator: userId,
      },
    });
  }
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "user",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            name: 1,
            email: 1,
            profileIcon: 1,
            phoneNumber: 1,
            accountState: 1,
            createdAt: 1,
          },
        },
      ],
      as: "user",
    },
  });
  pipeline.push({
    $unwind: "$user",
  });

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "creator",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              name: 1,
              email: 1,
              profileIcon: 1,
              phoneNumber: 1,
              accountState: 1,
            },
          },
        ],
        as: "creator",
      },
    });
    pipeline.push({
      $unwind: "$creator",
    });

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


  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: SubAdmin.schema }],
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

  const result = await SubAdmin.aggregate(pipeline);

  const subAdmins = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);


  return {
    subAdmins,
    meta,
  };
};

const findSubAdminsById = async (id) => {
  return SubAdmin.findById(id);
};

const findByIdAndUpdate = async (userId, permissions) => {
  return SubAdmin.findOneAndUpdate(
    { user: userId },
    { permissions },
    { new: true },
  );
};


const deleteSubAdmin = async (id) => {
  // Find subadmin first

  const subAdmin = await SubAdmin.findById(id);

  if (!subAdmin) {
    throw new Error("Sub Admin not found");
  }

  // Update user status to inactive

  await User.findByIdAndUpdate(
    { _id: new mongoose.Types.ObjectId(subAdmin.user) },
    {
      $set: {
        "accountState.status": "inactive",
      },
    },
    { new: true },
  );

  // Delete subadmin record

  return await SubAdmin.findByIdAndDelete(id);
};
module.exports = {
  createSubAdmins,
  getSubAdmins,
  findSubAdminsById,
  findByIdAndUpdate,
  deleteSubAdmin,
  getPermissions,
};
