const { getFullImageUrl } = require("@helperUtils/imageHelper.js");

const responseUtil = require("../../../../helperUtils/responseUtil.js");

const { convertUtcToTimezone } = responseUtil;

const formatAgreedRateToTimezone = (agreedRate, timezone) => {
  if (!agreedRate) return agreedRate;

  return {
    ...agreedRate,
    objectId:
      agreedRate.objectId && typeof agreedRate.objectId === "object"
        ? {
            ...agreedRate.objectId,
            profileIcon: getFullImageUrl(agreedRate.objectId?.profileIcon),
          }
        : agreedRate.objectId,
    createdAt: agreedRate.createdAt
      ? convertUtcToTimezone(agreedRate.createdAt, timezone)
      : agreedRate.createdAt,
    updatedAt: agreedRate.updatedAt
      ? convertUtcToTimezone(agreedRate.updatedAt, timezone)
      : agreedRate.updatedAt,
  };
};

module.exports = formatAgreedRateToTimezone;
