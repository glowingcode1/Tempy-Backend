const Booking = require("./Booking");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  getUserAndShift,
  findJobById_,
} = require("../job/jobRepository");

const createBooking = async (data) => {
  try {
    const booking = new Booking(data);
    await booking.save();
    return booking;
  } catch (err) {
    throw err;
  }
};

const getBooking = async ({
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
      [{ schema: Booking.schema }],
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

  const result = await Booking.aggregate(pipeline);

  const Booking = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, pending, inactive, deleted, withdraw] =
    await Promise.all([
      Booking.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Booking.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Booking.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "withdraw",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.BookingCount = {
    total,
    active,
    pending,
    inactive,
    withdraw,
    deleted,
  };

  return {
    Booking,
    meta,
  };
};

const getBookingByJob = async ({
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
      [{ schema: Booking.schema }],
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
  

  const result = await Booking.aggregate(pipeline);

  const Booking = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(job && { job: new mongoose.Types.ObjectId(job) }),
    ...(shift && { "shift._id": new mongoose.Types.ObjectId(shift) }),
  };

  const [total, active, pending, inactive, deleted, withdraw] =
    await Promise.all([
      Booking.countDocuments({
        ...countFilter,
        status: { $ne: "deleted" },
      }),

      Booking.countDocuments({
        ...countFilter,
        status: "active",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "pending",
      }),

      Booking.countDocuments({
        ...countFilter,
        status: "inactive",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "deleted",
      }),
      Booking.countDocuments({
        ...countFilter,
        status: "withdraw",
      }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.BookingCount = {
    total,
    active,
    pending,
    inactive,
    withdraw,
    deleted,
  };

  return { jobBookings: Booking, meta };
};

const findBookingById = async (id) => {
  return Booking.findById(id).lean().populate("user", "name email profileIcon");
};
const findBookingByUserId = async (worker,user,customer) => {
  if(customer){
    return Booking.find({ worker: new mongoose.Types.ObjectId(worker), status: { $in: ["pending", "inProgress","completed"] } }).lean().select("shift status snapshot");
  }
  return Booking.find({
    worker: new mongoose.Types.ObjectId(worker),
    employer: new mongoose.Types.ObjectId(user),
    status: { $in: ["pending", "inProgress", "completed"] },
  })
    .lean()
    .select("shift status snapshot payment attendance");
};
const findBookingById_ = async (id) => {
  return Booking.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Booking.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteBooking = async (id) => {
  return await Booking.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};


const filterFreeStaff = async (staffIds, shift) => {
  if (!staffIds?.length || !shift?.date) return staffIds || [];
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let reqStart = toMin(shift.startTime);
  let reqEnd = toMin(shift.endTime);
  if (reqEnd < reqStart) reqEnd += 1440; // overnight

  const workerIds = staffIds.map((id) => new mongoose.Types.ObjectId(id));

  const busy = await Booking.aggregate([
    {
      $match: {
        worker: { $in: workerIds },
        "shift.date": new Date(shift.date),
        status: { $in: ["pending", "inProgress"] },
      },
    },
    // booking start/end → minutes, with overnight correction
    {
      $addFields: {
        _bStart: {
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
        _bEndRaw: {
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
        _bEnd: {
          $cond: [
            { $lt: ["$_bEndRaw", "$_bStart"] },
            { $add: ["$_bEndRaw", 1440] },
            "$_bEndRaw",
          ],
        },
      },
    },
    // overlap: bStart < reqEnd AND bEnd > reqStart
    {
      $match: {
        $expr: {
          $and: [{ $lt: ["$_bStart", reqEnd] }, { $gt: ["$_bEnd", reqStart] }],
        },
      },
    },
    // one row per busy worker
    { $group: { _id: "$worker" } },
  ]);

  const busySet = new Set(busy.map((b) => String(b._id)));
  return staffIds.filter((id) => !busySet.has(String(id)));
};

const getWeeklyHours = async (userIds = []) => {
  if (!userIds.length) return [];

  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));

  // Monday 00:00 -> Sunday 23:59:59 of the current week
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7); // exclusive upper bound

  const toMin = (f) => ({
    $add: [
      { $multiply: [{ $toInt: { $substrCP: [f, 0, 2] } }, 60] },
      { $toInt: { $substrCP: [f, 3, 2] } },
    ],
  });

  const rows = await Booking.aggregate([
    {
      $match: {
        worker: { $in: ids },
        status: { $in: ["completed", "inProgress"] },
        "shift.date": { $gte: weekStart, $lt: weekEnd },
      },
    },
    {
      $group: {
        _id: "$worker",
        totalMinutes: {
          $sum: {
            $subtract: [
              {
                $let: {
                  vars: {
                    s: toMin("$shift.startTime"),
                    e: toMin("$shift.endTime"),
                  },
                  in: {
                    $cond: [
                      { $lte: ["$$e", "$$s"] },
                      { $add: [{ $subtract: ["$$e", "$$s"] }, 1440] }, // overnight
                      { $subtract: ["$$e", "$$s"] },
                    ],
                  },
                },
              },
              {
                $cond: [
                  { $eq: ["$shift.isBreak", true] },
                  { $ifNull: ["$shift.breakMin", 0] },
                  0,
                ],
              },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        hours: { $round: [{ $divide: ["$totalMinutes", 60] }, 2] },
      },
    },
  ]);


  const map = new Map(rows.map((r) => [String(r.userId), r.hours]));
  return userIds.map((id) => ({ userId: id, hours: map.get(String(id)) ?? 0 }));
};
module.exports = {
  createBooking,
  getBooking,
  findBookingById,
  getUserAndShift,
  findByIdAndUpdate,
  deleteBooking,
  findBookingById_,
  findJobById_,
  getBookingByJob,
  findBookingByUserId,
  filterFreeStaff,
  getWeeklyHours,
};
