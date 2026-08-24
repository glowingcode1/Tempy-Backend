const Booking = require("./Booking");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const { getUserAndShift, findJobById_ } = require("../job/jobRepository");

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
  worker,
  employer,
  latitude,
  longitude,
  km,
}) => {
  const pipeline = [];
  const baseMatch = {};

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
          coordinates: [Number(latitude), Number(longitude)],
        },
        key: "snapshot.location",
        distanceField: "distanceInMeters",
        spherical: true,
        // Remove maxDistance
        query: baseMatch,
      },
    });

    pipeline.push({
      $addFields: {
        distanceInMeters: {
          $round: ["$distanceInMeters", 2],
        },
        distanceInKm: {
          $round: [{ $divide: ["$distanceInMeters", 1000] }, 2],
        },
        distance: {
          $concat: [
            {
              $toString: {
                $round: [{ $divide: ["$distanceInMeters", 1000] }, 2],
              },
            },
            " km",
          ],
        },
      },
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
      },
    });
  }
  if (worker) {
    pipeline.push({
      $match: {
        worker: new mongoose.Types.ObjectId(worker),
      },
    });
  }
  if (employer) {
    pipeline.push({
      $match: {
        employer: new mongoose.Types.ObjectId(employer),
      },
    });
  }

  if (status) {
    // support multiple status values: array or comma-separated string
    let statusMatch;
    if (Array.isArray(status)) {
      statusMatch = { $in: status };
    } else if (typeof status === "string" && status.includes(",")) {
      statusMatch = { $in: status.split(",").map((s) => s.trim()) };
    } else {
      statusMatch = status;
    }
    pipeline.push({
      $match: {
        status: statusMatch,
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

  const booking = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(worker && { worker: new mongoose.Types.ObjectId(worker) }),
    ...(employer && { employer: new mongoose.Types.ObjectId(employer) }),
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
    booking,
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
    // support multiple status values: array or comma-separated string
    let statusMatch;
    if (Array.isArray(status)) {
      statusMatch = { $in: status };
    } else if (typeof status === "string" && status.includes(",")) {
      statusMatch = { $in: status.split(",").map((s) => s.trim()) };
    } else {
      statusMatch = status;
    }
    pipeline.push({
      $match: {
        status: statusMatch,
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

const findBookingById = async (id, projection = null) => {
  return Booking.findById(id)
    .select(projection)
    .lean()
    .populate("user", "name email profileIcon");
};
const findBookingByUserId = async (worker, user, customer) => {
  if (customer) {
    return Booking.find({
      worker: new mongoose.Types.ObjectId(worker),
      status: { $in: ["pending", "inProgress", "completed"] },
    })
      .lean()
      .select("shift status snapshot");
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
  return await Booking.findByIdAndUpdate(
    id,
    { status: "deleted" },
    { new: true },
  );
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
        status: { $in: ["pending", "active", "inProgress"] },
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

const findConflictingBooking = async (workerId, shift) => {
  if (!workerId || !shift?.date || !shift?.startTime || !shift?.endTime) {
    return null;
  }

  const toMin = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  let requestedStart = toMin(shift.startTime);
  let requestedEnd = toMin(shift.endTime);

  // Overnight shift
  if (requestedEnd <= requestedStart) {
    requestedEnd += 1440;
  }

  const workerObjectId = new mongoose.Types.ObjectId(workerId);

  const conflicts = await Booking.aggregate([
    {
      $match: {
        worker: workerObjectId,

        // Only bookings which actually occupy the worker's time
        status: {
          $in: ["pending", "active", "inProgress"],
        },

        "shift.date": new Date(shift.date),
      },
    },

    {
      $addFields: {
        _existingStart: {
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

        _existingEndRaw: {
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
        _existingEnd: {
          $cond: [
            {
              $lte: ["$_existingEndRaw", "$_existingStart"],
            },
            {
              $add: ["$_existingEndRaw", 1440],
            },
            "$_existingEndRaw",
          ],
        },
      },
    },

    {
      $match: {
        $expr: {
          $and: [
            {
              $lt: ["$_existingStart", requestedEnd],
            },
            {
              $gt: ["$_existingEnd", requestedStart],
            },
          ],
        },
      },
    },

    {
      $limit: 1,
    },
  ]);

  return conflicts[0] || null;
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

const getBookingsByUsersAndDateRange = async (worker, startDate, endDate) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return Booking.aggregate([
    {
      $match: {
        worker: { $in: worker },
        "shift.date": { $gte: start, $lte: end },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, accountState: 1 } }],
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "employer",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, accountState: 1 } }],
        as: "employer",
      },
    },
    { $unwind: { path: "$employer", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "worker",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, accountState: 1 } }],
        as: "worker",
      },
    },
    { $unwind: { path: "$worker", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "availabilities",
        let: { workerId: "$worker._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user", "$$workerId"] },
                  { $lte: ["$startDateTime", end] },
                  { $gte: ["$endDateTime", start] },
                ],
              },
            },
          },
          { $project: { status: 1, startDateTime: 1, endDateTime: 1 } },
        ],
        as: "availability",
      },
    },
    {
      $project: {
        shift: 1,
        payment: 1,
        worker: 1,
        user: 1,
        employer: 1,
        "snapshot.type": 1,
        status: 1,
        availability: 1,
      },
    },
  ]);
};
const getWorkerIdsByUserOrBranch = async (userId, branchId) => {
  const match = {
    $or: [
      { user: new mongoose.Types.ObjectId(userId) },
      ...(branchId ? [{ branch: new mongoose.Types.ObjectId(branchId) }] : []),
    ],
  };

  const bookings = await Booking.find(match).distinct("worker");
  return bookings; // array of worker ObjectIds
};

const getBookingsByDateRangeForUser = async ({
  userId,
  userType,
  startDate,
  endDate,
}) => {
  const match = {
    "shift.date": { $gte: startDate, $lte: endDate },
    status: { $ne: "deleted" },
  };

  // nurse sees own shifts, careHome/customer/employer sees shifts they created
  if (userType === "nurse") {
    match.worker = new mongoose.Types.ObjectId(userId);
  } else {
    match.user = new mongoose.Types.ObjectId(userId);
  }

  return Booking.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "jobs",
        localField: "job",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              shift: 1,
              payment: 1,
              worker: 1,
              user: 1,
              employer: 1,
              snapshot: 1,
              status: 1,
              availability: 1,
            },
          },
        ],
        as: "jobDetails",
      },
    },
    { $unwind: { path: "$jobDetails", preserveNullAndEmptyArrays: true } },
    { $sort: { "shift.date": 1 } },
  ]);
};

const getEarnings = async ({
  userId,
  userType,
  customer,
  supplier,
  from,
  to,
}) => {
  const match = {
    status: "completed",
  };

  let amountField = "$payment.totalAmount";

  if (customer) {
    match.user = new mongoose.Types.ObjectId(userId);
    amountField = "$payment.totalAmount";
  } else if (supplier && userType !== "nurse") {
    match.employer = new mongoose.Types.ObjectId(userId);
    amountField = "$payment.amountPayedToEmployer";
  } else if (userType === "nurse") {
    match.worker = new mongoose.Types.ObjectId(userId);
    amountField = "$payment.amountPayedToWorker";
  }

  if (from || to) {
    match["shift.date"] = {};

    if (from) {
      match["shift.date"].$gte = new Date(from);
    }

    if (to) {
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      match["shift.date"].$lte = endDate;
    }
  }

  const pipeline = [
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        totalEarnings: {
          $sum: {
            $ifNull: [amountField, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalBookings: 1,
        totalEarnings: 1,
      },
    },
  ];

  const result = await Booking.aggregate(pipeline);

  return (
    result[0] || {
      totalBookings: 0,
      totalEarnings: 0,
    }
  );
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
  findConflictingBooking,
  getWeeklyHours,
  getBookingsByUsersAndDateRange,
  getWorkerIdsByUserOrBranch,
  getBookingsByDateRangeForUser,
  getEarnings,
};
