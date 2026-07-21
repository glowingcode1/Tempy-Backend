const AgreedRate = require("./AgreedRates");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");

const createAgreedRate = async (data) => {
  const agreedRate = new AgreedRate(data);
  await agreedRate.save();
  return agreedRate;
};

const findAgreedRateById_ = async (id, projection = null) => {
  return AgreedRate.findById(id, projection || {});
};


const findExisting = async ({
  user,
  objectType,
  objectId,
  jobType,
  excludeId,
}) => {
  return AgreedRate.findOne({
    user,
    objectType,
    objectId,
    jobType,
    status: { $ne: "deleted" },
    ...(excludeId && { _id: { $ne: excludeId } }),
  });
};

const getAgreedRates = async ({
  page,
  limit,
  skip,
  keyword,
  status,
  user,
  objectType,
  objectId,
  jobType,
  projection,
}) => {
  const baseMatch = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(objectType && { objectType }),
    ...(objectId && {
      objectId: new mongoose.Types.ObjectId(objectId),
    }),
    ...(jobType && { jobType: new mongoose.Types.ObjectId(jobType) }),
    ...(status ? { status } : { status: { $ne: "deleted" } }),
  };

  const pipeline = [{ $match: baseMatch }];

  pipeline.push({
    $lookup: {
      from: "users",
      let: { objId: "$objectId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$objId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "objectId",
    },
  });

  pipeline.push({
    $unwind: { path: "$objectId", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $lookup: {
      from: "jobroles",
      let: { roleId: "$jobType" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$roleId"] } } },
        { $project: { department: 1, title: 1, status: 1 } },
      ],
      as: "jobType",
    },
  });

  pipeline.push({
    $unwind: { path: "$jobType", preserveNullAndEmptyArrays: true },
  });

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: AgreedRate.schema }],
      keyword,
    );
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  if (projection) {
    pipeline.push({ $project: projection });
  }

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await AgreedRate.aggregate(pipeline);

  const AgreedRates = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, deleted] = await Promise.all([
    AgreedRate.countDocuments({ ...countFilter, status: { $ne: "deleted" } }),
    AgreedRate.countDocuments({ ...countFilter, status: "active" }),
    AgreedRate.countDocuments({ ...countFilter, status: "inactive" }),
    AgreedRate.countDocuments({ ...countFilter, status: "deleted" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.AgreedRatesCount = { total, active, inactive, deleted };

  return { AgreedRates, meta };
};

const findByIdAndUpdate = async (id, data) => {
  return AgreedRate.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("objectId", "name email profileIcon")
    .populate("jobType", "title department status");
};

const deleteAgreedRate = async (id) => {
  return AgreedRate.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};

module.exports = {
  createAgreedRate,
  findAgreedRateById_,
  findExisting,
  getAgreedRates,
  findByIdAndUpdate,
  deleteAgreedRate,
};
