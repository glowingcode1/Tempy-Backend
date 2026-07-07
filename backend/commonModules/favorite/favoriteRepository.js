const Favorite = require("./Favorite");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");

const createFavorite = async (data) => {
  try {
    const favorite = new Favorite(data);
    await favorite.save();
    return favorite;
  } catch (err) {
    throw err;
  }
};

const getFavorite = async ({
  page,
  limit,
  keyword,
  favoriteUser,
  user,
  skip,
}) => {
  const pipeline = [];
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
        status: { $ne: "deleted" },
      },
    });
  }

  if (favoriteUser) {
    const favoriteUserIds = favoriteUser
      .split(",")
      .map((id) => new mongoose.Types.ObjectId(id.trim()));

    pipeline.push({
      $match: {
        favoriteUser: {
          $in: favoriteUserIds,
        },
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
      let: { userId: "$favoriteUser" },
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
            verificationStatus: 1,
            accountState: 1,
          },
        },
      ],
      as: "favoriteUser",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$favoriteUser",
      preserveNullAndEmptyArrays: true,
    },
  });
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Favorite.schema }],
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

  const result = await Favorite.aggregate(pipeline);

  const favorite = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, deleted] = await Promise.all([
    Favorite.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
    }),

    Favorite.countDocuments({
      ...countFilter,
      status: "active",
    }),

    Favorite.countDocuments({
      ...countFilter,
      status: "deleted",
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.FavoriteCount = {
    total,
    active,
    deleted,
  };

  return {
    favorite,
    meta,
  };
};

const getFavoriteByJob = async ({
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
      [{ schema: Favorite.schema }],
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

  const result = await Favorite.aggregate(pipeline);

  const Favorite = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(job && { job: new mongoose.Types.ObjectId(job) }),
    ...(shift && { "shift._id": new mongoose.Types.ObjectId(shift) }),
  };

  const [total, active, pending, inactive, deleted, withdraw] =
    await Promise.all([
      Favorite.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Favorite.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Favorite.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Favorite.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Favorite.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Favorite.countDocuments({
        ...countFilter,
        status: "withdraw",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.FavoriteCount = {
    total,
    active,
    pending,
    inactive,
    withdraw,
    deleted,
  };

  return { jobFavorites: Favorite, meta };
};

const findFavoriteById = async (id) => {
  return Favorite.findById(id);
};
const findFavoriteByFavoriteUserId = async (favoriteUser) => {
  return Favorite.findOne({
    favoriteUser: new mongoose.Types.ObjectId(favoriteUser),
  });
};

const findByIdAndUpdate = async (id, data) => {
  return Favorite.findByIdAndUpdate(new mongoose.Types.ObjectId(id), data, {
    new: true,
  })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteFavorite = async (id) => {
  return await Favorite.findByIdAndUpdate(
    new mongoose.Types.ObjectId(id),
    { status: "deleted" },
    { new: true },
  );
};
module.exports = {
  createFavorite,
  getFavorite,
  findFavoriteById,
  findByIdAndUpdate,
  deleteFavorite,
  findFavoriteByFavoriteUserId,
  getFavoriteByJob,
};
