const Bid = require("./Bid");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  getUserAndShift,
  findJobById_,
} = require("../../../roles/careHome/job/jobRepository");

const createBid = async (data) => {
  try {
    const existingBid = await Bid.findOne({
      user: new mongoose.Types.ObjectId(data.user),
      "shift._id": new mongoose.Types.ObjectId(data.shift),
    });
    if (existingBid) {
      return { error: "Bid_already_exists_for_this_user_against_this_shift" };
    }
    const [{ user, shift }, snapshot] = await Promise.all([
      getUserAndShift(data.job, data.shift),
      findJobById_(data.job),
    ]);

    data.snapshot = snapshot;
    data.jobCreater = user;
    data.shift = shift;

    if (!shift || !user) {
      return { error: "Invalid_job_or_shift" };
    }
    const job = new Bid(data);
    await job.save();
    return job;
  } catch (err) {
    throw err;
  }
};

const getBid = async ({
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
      [{ schema: Bid.schema }],
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

  const result = await Bid.aggregate(pipeline);

  const bid = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, pending, inactive, deleted, withdraw] =
    await Promise.all([
      Bid.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Bid.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Bid.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Bid.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Bid.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Bid.countDocuments({
        ...countFilter,
        status: "withdraw",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.BidCount = {
    total,
    active,
    pending,
    inactive,
    withdraw,
    deleted,
  };

  return {
    bid,
    meta,
  };
};

const findBidById = async (id) => {
  return Bid.findById(id).lean().populate("user", "name email profileIcon");
};
const findBidById_ = async (id) => {
  return Bid.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Bid.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteBid = async (id) => {
  return await Bid.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};
module.exports = {
  createBid,
  getBid,
  findBidById,
  getUserAndShift,
  findByIdAndUpdate,
  deleteBid,
  findBidById_,
  findJobById_,
};
