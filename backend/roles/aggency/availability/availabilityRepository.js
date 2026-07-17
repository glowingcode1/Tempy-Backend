const { mongoose } = require("mongoose");
const Availability = require("./Availability");
const { generateMeta } = require("@helperUtils/responseUtil");

const USER_PROJECTION = {
  name: 1,
  email: 1,
  profileIcon: 1,
  accountState: 1,
};

const createAvailability = async (data) => {
  try {
    const overlapping = await Availability.findOne({
      user: data.user,
      startDateTime: { $lt: data.endDateTime },
      endDateTime: { $gt: data.startDateTime },
    });

    if (overlapping) {
      return {
        error: "availability_overlaps_with_existing_entry",
      };
    }

    const availability = await Availability.create(data);
    return availability;
  } catch (err) {
    throw err;
  }
};

const getAvailability = async ({
  page,
  limit,
  status,
  user,
  startDate,
  endDate,
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
  }

  if (startDate || endDate) {
    const dateMatch = {};
    if (startDate) dateMatch.$gte = new Date(startDate);
    if (endDate) dateMatch.$lte = new Date(endDate);

    pipeline.push({
      $match: {
        startDateTime: dateMatch,
      },
    });
  }
  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: USER_PROJECTION },
      ],
      as: "user",
    },
  });
  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      let: { creatorId: "$creator" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$creatorId"] } } },
        { $project: USER_PROJECTION },
      ],
      as: "creator",
    },
  });

  pipeline.push({
    $unwind: { path: "$creator", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $sort: {
      startDateTime: -1,
    },
  });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Availability.aggregate(pipeline);

  const availability = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, busy, onCall, sleepover, dayOff, leave] =
    await Promise.all([
      Availability.countDocuments({ ...countFilter }),
      Availability.countDocuments({ ...countFilter, status: "active" }),
      Availability.countDocuments({ ...countFilter, status: "busy" }),
      Availability.countDocuments({ ...countFilter, status: "onCall" }),
      Availability.countDocuments({ ...countFilter, status: "sleepover" }),
      Availability.countDocuments({ ...countFilter, status: "dayOff" }),
      Availability.countDocuments({ ...countFilter, status: "leave" }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.AvailabilityCount = {
    total,
    active,
    busy,
    onCall,
    sleepover,
    dayOff,
    leave,
  };

  return {
    availability,
    meta,
  };
};

const getAvailabilitySummary = async ({
  page,
  limit,
  status,
  user,
  startDate,
  endDate,
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
  }

  if (startDate || endDate) {
    const dateMatch = {};
    if (startDate) dateMatch.$gte = new Date(startDate);
    if (endDate) dateMatch.$lte = new Date(endDate);

    pipeline.push({
      $match: {
        startDateTime: dateMatch,
      },
    });
  }

  pipeline.push({
    $sort: {
      startDateTime: -1,
    },
  });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Availability.aggregate(pipeline);

  const availability = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, busy, onCall, sleepover, dayOff, leave] =
    await Promise.all([
      Availability.countDocuments({ ...countFilter }),
      Availability.countDocuments({ ...countFilter, status: "active" }),
      Availability.countDocuments({ ...countFilter, status: "busy" }),
      Availability.countDocuments({ ...countFilter, status: "onCall" }),
      Availability.countDocuments({ ...countFilter, status: "sleepover" }),
      Availability.countDocuments({ ...countFilter, status: "dayOff" }),
      Availability.countDocuments({ ...countFilter, status: "leave" }),
    ]);

  const meta = generateMeta(page, limit, totalFiltered);

  meta.AvailabilityCount = {
    total,
    active,
    busy,
    onCall,
    sleepover,
    dayOff,
    leave,
  };

  return {
    availability,
    meta,
  };
};

const findAvailabilityById_ = async (id, projection = null) => {
  return Availability.findById(id, projection);
};

const findByIdAndUpdate = async (id, data) => {
  return Availability.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon userType")
    .populate("creator", "name email profileIcon userType");
};

const deleteAvailability = async (id) => {
  return await Availability.findByIdAndDelete(id);
};

const findOverlappingAvailability = async ({
  user,
  startDateTime,
  endDateTime,
  excludeId,
}) => {
  return Availability.findOne({
    _id: { $ne: excludeId },
    user,
    startDateTime: { $lt: endDateTime },
    endDateTime: { $gt: startDateTime },
  });
};

module.exports = {
  createAvailability,
  getAvailability,
  findAvailabilityById_,
  findByIdAndUpdate,
  deleteAvailability,
  findOverlappingAvailability,
  getAvailabilitySummary,
};
