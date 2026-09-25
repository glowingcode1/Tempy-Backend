const { withFullProfileIcon } = require("@helperUtils/imageHelper.js");

const responseUtil = require("../../../../helperUtils/responseUtil.js");

const { convertUtcToTimezone } = responseUtil;

const toTimezone = (date, timezone) =>
  date ? convertUtcToTimezone(date, timezone) : date;

// Offers made before special days existed have none stored.
const withSpecialDays = (rates) =>
  rates ? { ...rates, specialDays: rates.specialDays || [] } : rates;

const formatAgreedRateToTimezone = (agreedRate, timezone) => {
  if (!agreedRate) return agreedRate;

  return {
    ...agreedRate,
    rates: withSpecialDays(agreedRate.rates),
    ...(agreedRate.review && {
      review: {
        ...agreedRate.review,
        requestedRates: withSpecialDays(agreedRate.review.requestedRates),
      },
    }),
    supplier: withFullProfileIcon(agreedRate.supplier),
    customer: withFullProfileIcon(agreedRate.customer),
    effectiveFrom: toTimezone(agreedRate.effectiveFrom, timezone),
    respondedAt: toTimezone(agreedRate.respondedAt, timezone),
    createdAt: toTimezone(agreedRate.createdAt, timezone),
    updatedAt: toTimezone(agreedRate.updatedAt, timezone),
  };
};

module.exports = formatAgreedRateToTimezone;
