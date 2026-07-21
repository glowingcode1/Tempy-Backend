const AgreedRateRepo = require("./agreedRatesRepository");
const formatAgreedRateToTimezone = require("./formator/formatAgreedRatesToTimezone");

const createAgreedRate = async (data) => {
  const existing = await AgreedRateRepo.findExisting(data);
  if (existing) {
    return { error: "AgreedRate_already_exists" };
  }

  const agreedRate = await AgreedRateRepo.createAgreedRate(data);
  return agreedRate;
};

const getAgreedRates = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  objectType,
  objectId,
  jobType,
  projection,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { AgreedRates, meta } = await AgreedRateRepo.getAgreedRates({
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
  });

  const formatedAgreedRates = AgreedRates.map((rate) =>
    formatAgreedRateToTimezone(rate, timezone),
  );

  return { AgreedRates: formatedAgreedRates, meta };
};

const updateAgreedRate = async (id, data) => {
  const agreedRate = await AgreedRateRepo.findAgreedRateById_(id);

  if (!agreedRate) {
    return { error: "AgreedRate_not_found" };
  }

  const allowedFields = [
    "objectType",
    "objectId",
    "jobType",
    "rateType",
    "rate",
    "autoAssign",
    "status",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return agreedRate;
  }

  // re-check for duplicates only if the partner/role identity is changing
  const identityFields = ["objectType", "objectId", "jobType"];
  const identityChanging = identityFields.some(
    (field) => updateData[field] !== undefined,
  );

  if (identityChanging) {
    const existing = await AgreedRateRepo.findExisting({
      user: agreedRate.user,
      objectType: updateData.objectType ?? agreedRate.objectType,
      objectId: updateData.objectId ?? agreedRate.objectId,
      jobType: updateData.jobType ?? agreedRate.jobType,
      excludeId: id,
    });

    if (existing) {
      return { error: "AgreedRate_already_exists" };
    }
  }

  const updated = await AgreedRateRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteAgreedRate = async (id) => {
  if (!id) throw new Error("AgreedRate ID is required");

  const deleted = await AgreedRateRepo.deleteAgreedRate(id);

  return !!deleted;
};

module.exports = {
  createAgreedRate,
  getAgreedRates,
  updateAgreedRate,
  deleteAgreedRate,
};
