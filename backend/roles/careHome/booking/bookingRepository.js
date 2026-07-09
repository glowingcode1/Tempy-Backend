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
};
