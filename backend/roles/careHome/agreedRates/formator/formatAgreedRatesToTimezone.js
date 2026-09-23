const { withFullProfileIcon } = require("@helperUtils/imageHelper.js");

const responseUtil = require("../../../../helperUtils/responseUtil.js");

const { convertUtcToTimezone } = responseUtil;

const toTimezone = (date, timezone) =>
  date ? convertUtcToTimezone(date, timezone) : date;

const formatAgreedRateToTimezone = (agreedRate, timezone) => {
  if (!agreedRate) return agreedRate;

  return {
    ...agreedRate,
    supplier: withFullProfileIcon(agreedRate.supplier),
    customer: withFullProfileIcon(agreedRate.customer),
    effectiveFrom: toTimezone(agreedRate.effectiveFrom, timezone),
    respondedAt: toTimezone(agreedRate.respondedAt, timezone),
    createdAt: toTimezone(agreedRate.createdAt, timezone),
    updatedAt: toTimezone(agreedRate.updatedAt, timezone),
  };
};

module.exports = formatAgreedRateToTimezone;
