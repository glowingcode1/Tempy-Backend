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
const moment = require("moment-timezone");
const Booking = require("../../../roles/careHome/booking/Booking");
const createStaff = async (data) => {
  try {
    // Scoped to the employer: the same nurse may be staff at several employers,
    // which is what the { user, staff } unique index allows.
    const existingStaff = await Staff.findOne({
      user: data.user,
      staff: data.staff,
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
/*
 * A customer's staff are the workers booked on its jobs, one per worker,
 * counted by the WORKER'S account status - what the staff list filters on.
 * Counting bookings instead gave tabs such as "completed" a badge, while
 * clicking one filtered accountState.status against a value no account can
 * hold, so the list came back empty.
 *
 * Shared by the staff list and the customer dashboard so the two agree.
 * With no customer it counts every booked worker (admin view).
 */
const countCustomerStaffByStatus = async (customerId) => {
  const statusRows = await Booking.aggregate([
    {
      $match: customerId
        ? { user: new mongoose.Types.ObjectId(String(customerId)) }
        : {},
    },
    {
      $lookup: {
        from: "users",
        let: { workerId: "$worker" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$workerId"] } } },
          { $project: { "accountState.status": 1 } },
        ],
        as: "worker",
      },
    },
    { $unwind: { path: "$worker", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$worker._id",
        status: { $first: "$worker.accountState.status" },
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const countOf = (value) =>
    statusRows.find((row) => row._id === value)?.count || 0;

  /*
   * Mirrors the list's default match ($ne "deleted"), which in Mongo also
   * keeps workers with no account status recorded.
   */
  const total = statusRows
    .filter((row) => row._id !== "deleted")
    .reduce((sum, row) => sum + row.count, 0);

  return {
    total,
    active: countOf("active"),
    pending: countOf("pending"),
    inactive: countOf("inactive"),
    deleted: countOf("deleted"),
  };
};

const getStaffCustomer = async ({
  page,
  limit,
  keyword,
  status,
  user,
  skip,
  timezone,
  customer,
}) => {
  const pipeline = [];

  if (customer) {
    pipeline.push({
      $match: { user: new mongoose.Types.ObjectId(user) },
    });
  }

  // customer (user)
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "user",
    },
  });
  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
  });
  //rmployer
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$employer" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "employer",
    },
  });
  pipeline.push({
    $unwind: { path: "$employer", preserveNullAndEmptyArrays: true },
  });

  // worker
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$worker" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "worker",
    },
  });
  pipeline.push({
    $unwind: { path: "$worker", preserveNullAndEmptyArrays: true },
  });
  //branch
  pipeline.push({
    $lookup: {
      from: "branches",
      let: { branchId: "$branch" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$branchId"] } } },
        { $project: { name: 1, location: 1, manager: 1 } },
      ],
      as: "branch",
    },
  });
  pipeline.push({
    $unwind: { path: "$branch", preserveNullAndEmptyArrays: true },
  });

  // review stats for the customer
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { userId: "$user._id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$objectUser", "$$userId"] } } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ],
      as: "userReviewStats",
    },
  });

  // review stats for the worker
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { workerId: "$worker._id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$objectUser", "$$workerId"] } } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ],
      as: "workerReviewStats",
    },
  });

  // flatten both into their own objects
  pipeline.push({
    $addFields: {
      "user.averageRating": {
        $round: [
          {
            $ifNull: [
              { $arrayElemAt: ["$userReviewStats.averageRating", 0] },
              0,
            ],
          },
          1,
        ],
      },
      "user.totalReviews": {
        $ifNull: [{ $arrayElemAt: ["$userReviewStats.totalReviews", 0] }, 0],
      },
      "worker.averageRating": {
        $round: [
          {
            $ifNull: [
              { $arrayElemAt: ["$workerReviewStats.averageRating", 0] },
              0,
            ],
          },
          1,
        ],
      },
      "worker.totalReviews": {
        $ifNull: [{ $arrayElemAt: ["$workerReviewStats.totalReviews", 0] }, 0],
      },
    },
  });
  // average weekly earning for the worker
  pipeline.push({
    $lookup: {
      from: "bookings",
      let: { workerId: "$worker._id" },
      pipeline: [
        {
          $match: {
            status: { $in: ["completed", "inProgress", "pending"] }, // only earned bookings
            $expr: { $eq: ["$worker", "$$workerId"] },
          },
        },
        {
          // bucket each booking into its ISO week (based on shift.date)
          $group: {
            _id: {
              year: { $isoWeekYear: "$shift.date" },
              week: { $isoWeek: "$shift.date" },
            },
            weekEarning: {
              $sum: { $ifNull: ["$payment.amountPayedToWorker", 0] },
            },
          },
        },
        {
          // average across the weeks the worker actually worked
          $group: {
            _id: null,
            averageWeeklyEarning: { $avg: "$weekEarning" },
          },
        },
      ],
      as: "earningStats",
    },
  });

  pipeline.push({
    $addFields: {
      "worker.averageWeeklyEarning": {
        $round: [
          {
            $ifNull: [
              { $arrayElemAt: ["$earningStats.averageWeeklyEarning", 0] },
              0,
            ],
          },
          2,
        ],
      },
    },
  });
  pipeline.push({
    $match: status
      ? { "worker.accountState.status": status }
      : { "worker.accountState.status": { $ne: "deleted" } },
  });
  pipeline.push({
    $project: { userReviewStats: 0, workerReviewStats: 0, earningStats: 0 },
  });
  pipeline.push({
    $group: {
      _id: "$worker._id",

      // worker already carries averageWeeklyEarning (+ review stats) from earlier stages
      worker: { $first: "$worker" },
      user: { $first: "$user" },
      employer: { $first: "$employer" },

      bookingCount: { $sum: 1 },

      createdAt: { $max: "$createdAt" },
      latestShiftDate: { $max: "$shift.date" },
    },
  });

  // after $lookup + $unwind for `user`, before $facet
  if (keyword) {
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex chars
    pipeline.push({
      $match: { "worker.name": { $regex: safe, $options: "i" } },
    });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Booking.aggregate(pipeline);

  const staff = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  meta.StaffCount = await countCustomerStaffByStatus(
    customer ? user : null,
  );

  return { staff, meta };
};

const getStaff = async ({
  page,
  limit,
  keyword,
  status,
  user,
  skip,
  timezone,
  customer,
}) => {
  const now = moment.tz(timezone);
  const startOfThisWeek = now.clone().startOf("week").toDate();
  const endOfThisWeek = now.clone().endOf("week").toDate();
  const pipeline = [];
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
      },
    });
  }

  /*
   * No default status filter: the roster shows every record, deleted
   * included, so the Total tab badge matches the rows it describes and is
   * the sum of the individual status tabs.
   */
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
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$staff" },
      pipeline: [
        {
          /*
           * Deliberately no status filter: `status` is the Staff record's
           * status and is already matched at the top of this pipeline.
           * Re-applying it to the joined account emptied the nested staff
           * object whenever the two enums disagreed - "left" is a Staff
           * status no account can ever hold, so ?status=left returned rows
           * with no name, email or avatar.
           */
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
            weeklyHours: 1,
          },
        },
      ],
      as: "staff",
    },
  });
  //branch
  pipeline.push({
    $lookup: {
      from: "branches",
      let: { branchId: "$branch" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$branchId"] } } },
        { $project: { name: 1, location: 1, manager: 1 } },
      ],
      as: "branch",
    },
  });
  pipeline.push({
    $unwind: { path: "$branch", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $unwind: {
      path: "$staff",
      preserveNullAndEmptyArrays: true,
    },
  });

  pipeline.push({
    $lookup: {
      from: "favorites",
      let: {
        staffId: "$staff._id",
        userId: new mongoose.Types.ObjectId(user),
      },
      pipeline: [
        {
          $match: {
            status: "active",
            $expr: {
              $and: [
                { $eq: ["$user", "$$userId"] },
                { $eq: ["$favoriteUser", "$$staffId"] },
              ],
            },
          },
        },
      ],
      as: "favorite",
    },
  });

  // true if a matching favorite exists, false otherwise
  pipeline.push({
    $addFields: {
      isFavorite: { $gt: [{ $size: "$favorite" }, 0] },
    },
  });
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { userId: "$user._id" },
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
      as: "userReviewStats",
    },
  });

  // review stats for the staff
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { staffId: "$staff._id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$objectUser", "$$staffId"] },
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
      as: "staffReviewStats",
    },
  });

  // flatten both into their own objects
  pipeline.push({
    $addFields: {
      "user.averageRating": {
        $round: [
          {
            $ifNull: [
              { $arrayElemAt: ["$userReviewStats.averageRating", 0] },
              0,
            ],
          },
          1,
        ],
      },
      "user.totalReviews": {
        $ifNull: [{ $arrayElemAt: ["$userReviewStats.totalReviews", 0] }, 0],
      },
      "staff.averageRating": {
        $round: [
          {
            $ifNull: [
              { $arrayElemAt: ["$staffReviewStats.averageRating", 0] },
              0,
            ],
          },
          1,
        ],
      },
      "staff.totalReviews": {
        $ifNull: [{ $arrayElemAt: ["$staffReviewStats.totalReviews", 0] }, 0],
      },
    },
  });

  // drop the intermediate arrays
  pipeline.push({
    $project: { favorite: 0, userReviewStats: 0, staffReviewStats: 0 },
  });

  pipeline.push({
    $lookup: {
      from: "bookings",
      let: {
        workerId: "$staff._id",
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
                        $arrayElemAt: [
                          { $split: ["$shift.startTime", ":"] },
                          0,
                        ],
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
                    $subtract: [
                      "$_rawMin",
                      { $ifNull: ["$shift.breakMin", 0] },
                    ],
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
        $ifNull: ["$staff.weeklyHours", 0],
      },
      "workStats.totalBookings": {
        $ifNull: [{ $arrayElemAt: ["$workStats_.totalBookings", 0] }, 0],
      },
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

  const [total, active, pending, inactive, deleted, left] = await Promise.all([
    // Every record - deleted included - so total === sum of the status tabs.
    Staff.countDocuments({
      ...countFilter,
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
const findStaffByUserAndStaff = async (user, staff) => {
  return Staff.findOne({
    user: new mongoose.Types.ObjectId(user),
    staff: new mongoose.Types.ObjectId(staff),
  });
};

const findByIdAndUpdate = async (id, data) => {
  return Staff.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteStaff = async (id) => {
  return await Staff.findByIdAndUpdate(
    id,
    { status: "deleted" },
    { new: true },
  );
};

const findStaffNearJob = async (user, jobDetails, km = 50) => {
  const [lat, lng] = jobDetails?.location?.coordinates || [];
  if (lng == null || lat == null) return [];
  const nearby = await Staff.aggregate([
    // this employer's active staff
    {
      $match: {
        user: new mongoose.Types.ObjectId(user),
        status: "active",
      },
    },
    // pull each staff's user location
    {
      $lookup: {
        from: "users",
        let: { staffId: "$staff" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$staffId"] } } },
          { $project: { location: 1 } },
        ],
        as: "staffUser",
      },
    },
    { $unwind: "$staffUser" },
    // compute distance (meters) from the job to each staff
    {
      $addFields: {
        distance: {
          $let: {
            vars: { coords: "$staffUser.location.coordinates" },
            in: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$$coords", []] } }, 1] },
                {
                  $multiply: [
                    6371000, // earth radius (m)
                    {
                      $acos: {
                        $min: [
                          1,
                          {
                            $add: [
                              {
                                $multiply: [
                                  { $sin: { $degreesToRadians: lat } },
                                  {
                                    $sin: {
                                      $degreesToRadians: {
                                        $arrayElemAt: ["$$coords", 0],
                                      },
                                    },
                                  },
                                ],
                              },
                              {
                                $multiply: [
                                  { $cos: { $degreesToRadians: lat } },
                                  {
                                    $cos: {
                                      $degreesToRadians: {
                                        $arrayElemAt: ["$$coords", 0],
                                      },
                                    },
                                  },
                                  {
                                    $cos: {
                                      $subtract: [
                                        {
                                          $degreesToRadians: {
                                            $arrayElemAt: ["$$coords", 1],
                                          },
                                        },
                                        { $degreesToRadians: lng },
                                      ],
                                    },
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    },
    // keep only those within km
    { $match: { distance: { $ne: null, $lte: km * 1000 } } },
    { $project: { _id: 1, staff: 1, distance: 1, weeklyHours: 1 } },
  ]);

  return nearby.map((s) => s.staff.toString());
};
const getStaffIdsByUser = (userId) =>
  Staff.find({ user: userId }).distinct("staff");

// Staff currently working for this employer (pending invites and leavers out).
const getActiveStaffIds = (employerId) =>
  Staff.find({
    user: new mongoose.Types.ObjectId(String(employerId)),
    status: "active",
  }).distinct("staff");

const isActiveStaffOf = async (employerId, staffId) =>
  Boolean(
    await Staff.exists({
      user: new mongoose.Types.ObjectId(String(employerId)),
      staff: new mongoose.Types.ObjectId(String(staffId)),
      status: "active",
    }),
  );

const findStaffRequestById = async (id) => {
  return Staff.findById(id);
};

const getMyStaffRequests = async ({ nurseId, page, limit, skip }) => {
  const pipeline = [
    {
      $match: {
        staff: new mongoose.Types.ObjectId(nurseId),
        status: "pending",
      },
    },

    // Agency
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "agency",
      },
    },

    {
      $unwind: {
        path: "$agency",
        preserveNullAndEmptyArrays: false,
      },
    },

    {
      $lookup: {
        from: "branches",
        localField: "branch",
        foreignField: "_id",
        as: "branch",
      },
    },

    {
      $unwind: {
        path: "$branch",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $project: {
        _id: 1,
        speciality: 1,
        ratePerHour: 1,
        platformPercent: 1,
        status: 1,
        createdAt: 1,

        agency: {
          _id: "$agency._id",
          name: "$agency.name",
          email: "$agency.email",
          profileIcon: "$agency.profileIcon",
        },

        branch: {
          _id: "$branch._id",
          name: "$branch.name",
          location: "$branch.location",
        },
      },
    },

    {
      $sort: {
        createdAt: -1,
      },
    },

    {
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [
          {
            $count: "count",
          },
        ],
      },
    },
  ];

  const result = await Staff.aggregate(pipeline);

  const requests = result[0]?.data || [];

  const total = result[0]?.totalFiltered?.[0]?.count || 0;

  const meta = generateMeta(page, limit, total);

  return {
    requests,
    meta,
  };
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
  getStaffCustomer,
  findStaffByUserAndStaff,
  findStaffNearJob,
  getStaffIdsByUser,
  countCustomerStaffByStatus,
  getActiveStaffIds,
  isActiveStaffOf,
  findStaffRequestById,
  getMyStaffRequests,
};
