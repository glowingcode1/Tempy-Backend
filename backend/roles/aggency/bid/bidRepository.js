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
const moment = require("moment-timezone");
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
    data.jobCreator = user;
    data.shift = shift;
    data.type=snapshot.type;

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
  jobCreator,
  skip,
}) => {
  const pipeline = [];
  if (jobCreator) {
    pipeline.push({
      $match: {
        jobCreator: new mongoose.Types.ObjectId(jobCreator),
      },
    });
  }
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
        let: { typeId: "$type" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$typeId"],
              },
            },
          },
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
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$jobCreator" },
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
      as: "jobCreator",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$jobCreator",
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

const getBidByJob = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  dateFilter,
  job,
  skip,
  shift,
  user,
  jobCreator,
}) => {
  const pipeline = [];
  const now = moment.tz(timezone);
  const next24h = now.clone().add(24, "hours").toDate();
  const startOfThisWeek = now.clone().startOf("week").toDate();
  const endOfThisWeek = now.clone().endOf("week").toDate();
  const startOfNextWeek = now.clone().add(1, "week").startOf("week").toDate();
  const endOfNextWeek = now.clone().add(1, "week").endOf("week").toDate();
  const ranges = {
    next24h: { $gte: now.toDate(), $lte: next24h },
    thisWeek: { $gte: startOfThisWeek, $lte: endOfThisWeek },
    nextWeek: { $gte: startOfNextWeek, $lte: endOfNextWeek },
  };

  if (jobCreator) {
    pipeline.push({
      $match: {
        jobCreator: new mongoose.Types.ObjectId(jobCreator),
      },
    });
  }
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
      },
    });
  }
  if (dateFilter && ranges[dateFilter]) {
    pipeline.push({
      $match: {
        "shift.date": ranges[dateFilter],
      },
    });
  }
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
            weeklyHours: 1,
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
      let: { typeId: { $toObjectId: "$type" } },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$_id", "$$typeId"],
            },
          },
        },
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
  pipeline.push({
    $unwind: {
      path: "$user",
      preserveNullAndEmptyArrays: true,
    },
  });
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$jobCreator" },
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
      as: "jobCreator",
    },
  });
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { userId: "$user._id" }, // <-- ._id, not the whole object
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$objectUser", "$$userId"] },
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ],
      as: "reviewStats",
    },
  });

  // Write the stats INSIDE the user object
  pipeline.push({
    $addFields: {
      "user.averageRating": {
        $round: [
          { $ifNull: [{ $arrayElemAt: ["$reviewStats.averageRating", 0] }, 0] },
          1,
        ],
      },
      "user.totalReviews": {
        $ifNull: [{ $arrayElemAt: ["$reviewStats.totalReviews", 0] }, 0],
      },
    },
  });

  pipeline.push({ $project: { reviewStats: 0 } });

  pipeline.push({
    $unwind: {
      path: "$jobCreator",
      preserveNullAndEmptyArrays: true,
    },
  });


pipeline.push({
  $lookup: {
    from: "bookings",
    let: {
      workerId: "$user._id",
      weekStart: startOfThisWeek,
      weekEnd: endOfThisWeek,
    },
    pipeline: [
      {
        $match: {
          status: { $in: ["pending", "inProgress", "completed"] },
          $expr: {
            $and: [
              { $eq: ["$worker", "$$workerId"] },
              { $gte: ["$shift.date", "$$weekStart"] },
              { $lte: ["$shift.date", "$$weekEnd"] },
            ],
          },
        },
      },
      {
        // parse "HH:mm" -> minutes since midnight
        $addFields: {
          _startMin: {
            $add: [
              {
                $multiply: [
                  {
                    $toInt: {
                      $arrayElemAt: [{ $split: ["$shift.startTime", ":"] }, 0],
                    },
                  },
                  60,
                ],
              },
              {
                $toInt: {
                  $arrayElemAt: [{ $split: ["$shift.startTime", ":"] }, 1],
                },
              },
            ],
          },
          _endMin: {
            $add: [
              {
                $multiply: [
                  {
                    $toInt: {
                      $arrayElemAt: [{ $split: ["$shift.endTime", ":"] }, 0],
                    },
                  },
                  60,
                ],
              },
              {
                $toInt: {
                  $arrayElemAt: [{ $split: ["$shift.endTime", ":"] }, 1],
                },
              },
            ],
          },
        },
      },
      {
        $addFields: {
          _rawMin: {
            $let: {
              vars: { diff: { $subtract: ["$_endMin", "$_startMin"] } },
              in: {
                $cond: [
                  { $lt: ["$$diff", 0] },
                  { $add: ["$$diff", 1440] }, // overnight
                  "$$diff",
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalHours: {
            $sum: {
              $divide: [
                {
                  $subtract: ["$_rawMin", { $ifNull: ["$shift.breakMin", 0] }],
                },
                60,
              ],
            },
          },
          totalBookings: { $sum: 1 },
        },
      },
    ],
    as: "workStats_",
  },
});

// flatten onto staff
pipeline.push({
  $addFields: {
    "workStats.totalHoursWorked": {
      $round: [
        { $ifNull: [{ $arrayElemAt: ["$workStats_.totalHours", 0] }, 0] },
        2,
      ],
    },
    "workStats.hoursAllowed": {
      $ifNull: ["$user.weeklyHours", 0],
    },
    "workStats.totalBookings": {
      $ifNull: [{ $arrayElemAt: ["$workStats_.totalBookings", 0] }, 0],
    },
  },
});

// pipeline.push({ $project: { workStats_: 0 } });


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
console.log(JSON.stringify(result[0]?.data?.[0]?.workStats_, null, 2));
  const bid = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(job && { job: new mongoose.Types.ObjectId(job) }),
    ...(shift && { "shift._id": new mongoose.Types.ObjectId(shift) }),
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(jobCreator && { jobCreator: new mongoose.Types.ObjectId(jobCreator) }),
  };

  const [
    total,
    active,
    pending,
    inactive,
    deleted,
    withdraw,
    next24hCount,
    thisWeekCount,
    nextWeekCount,
  ] = await Promise.all([
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
    // shift within the next 24 hours
    Bid.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      "shift.date": { $gte: now.toDate(), $lte: next24h },
    }),

    // shift within this week
    Bid.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      "shift.date": { $gte: startOfThisWeek, $lte: endOfThisWeek },
    }),

    // shift within next week
    Bid.countDocuments({
      ...countFilter,
      status: { $ne: "deleted" },
      "shift.date": { $gte: startOfNextWeek, $lte: endOfNextWeek },
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
    next24hCount,
    thisWeekCount,
    nextWeekCount,
  };

  return { jobBids: bid, meta };
};

const findBidById = async (id) => {
  return Bid.findById(id).lean().populate("user", "name email profileIcon");
};
const findBidById_ = async (id,projection = null) => {
  return Bid.findById(id, projection);
};

const findByIdAndUpdate = async (id, data) => {
  return Bid.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteBid = async (id) => {
  return await Bid.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};

const updateBidStatuses = async (bidId, currentBidStatus = "accepted", remainingBidStatus = "rejected") => {
  const bid = await Bid.findById(bidId).select("shift._id");

  if (!bid) {
    throw new Error("Bid not found");
  }

  await Promise.all([
    // Accept the selected bid
    Bid.updateOne({ _id: bidId }, { $set: { status: currentBidStatus } }),

    // Reject all other bids for the same shift
    Bid.updateMany(
      {
        "shift._id": bid.shift._id,
        _id: { $ne: bidId },
      },
        { $set: { status: remainingBidStatus } },
    ),
  ]);
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
  getBidByJob,
  updateBidStatuses,
};
