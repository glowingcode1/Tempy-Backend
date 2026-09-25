const { isValidObjectId } = require("mongoose");
const moment = require("moment");
const { MAX_SPECIAL_DAYS } = require("./AgreedRates");
const { parsePaginationParams } = require("@helperUtils/responseUtil");
const sendServiceResult = require("@helperUtils/sendServiceResult");
const AgreedRateService = require("./agreedRatesService");
const { notifyAgreedRate } = require("./agreedRateNotifications");

// Runs the handler, then tells the other side if it succeeded.
const withNotification = (action, handler) => async (req) => {
  const result = await handler(req);
  if (result?.data) notifyAgreedRate(action, result.data, req.user);
  return result;
};

const RATE_KEYS = ["day", "night", "weekend"];

const isCalendarDay = (value) =>
  typeof value === "string" && moment(value, "YYYY-MM-DD", true).isValid();

/*
 * Special days: undefined when not sent, so an update keeps the ones it has.
 * Two entries may not fall on the same day; a yearly one covers its month and
 * day in every year, a one-off only its date.
 */
const parseSpecialDays = (specialDays) => {
  if (specialDays === undefined) return { specialDays: undefined };

  if (!Array.isArray(specialDays) || specialDays.length > MAX_SPECIAL_DAYS) {
    return { error: "Invalid_special_days" };
  }

  const parsed = [];

  for (const entry of specialDays) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const rate = Number(entry?.rate);

    if (
      !name ||
      name.length > 60 ||
      !isCalendarDay(entry?.date) ||
      !(rate > 0)
    ) {
      return { error: "Invalid_special_days" };
    }

    parsed.push({
      name,
      date: entry.date,
      repeatsYearly: entry.repeatsYearly === true,
      rate,
    });
  }

  const clash = parsed.some((a, i) =>
    parsed
      .slice(i + 1)
      .some((b) =>
        a.repeatsYearly || b.repeatsYearly
          ? a.date.slice(5) === b.date.slice(5)
          : a.date === b.date,
      ),
  );

  if (clash) return { error: "Duplicate_special_day" };

  return { specialDays: parsed };
};

// Day, night and weekend rates, all above zero, and any special days.
const parseRates = (rates) => {
  if (!rates) return { error: "day_night_weekend_rates_required" };

  const parsed = {};

  for (const key of RATE_KEYS) {
    const value = Number(rates[key]);
    if (!(value > 0)) return { error: "day_night_weekend_rates_required" };
    parsed[key] = value;
  }

  const { specialDays, error } = parseSpecialDays(rates.specialDays);
  if (error) return { error };
  if (specialDays) parsed.specialDays = specialDays;

  return { rates: parsed };
};

// undefined when not sent, null when sent but not a date.
const parseDate = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  return isNaN(date) ? null : date;
};

const createAgreedRate = sendServiceResult(
  withNotification("created", async (req) => {
    const { customer, jobType } = req.body;
    const { rates, error } = parseRates(req.body.rates);
    const effectiveFrom = parseDate(req.body.effectiveFrom);

    if (!isValidObjectId(customer) || !isValidObjectId(jobType)) {
      return { error: "customer_and_jobType_required" };
    }
    if (error) return { error };
    if (effectiveFrom === null) return { error: "invalid_effectiveFrom" };

    return AgreedRateService.createAgreedRate({
      supplier: req.user._id,
      supplierType: req.user.userType,
      customer,
      jobType,
      rates,
      effectiveFrom,
      timezone: req.user.timezone,
    });
  }),
  "AgreedRate_created_successfully",
  201,
);

const getAgreedRates = sendServiceResult(async (req) => {
  const { page, limit } = parsePaginationParams(req);
  const { status, supplier, customer, jobType } = req.query;

  return AgreedRateService.getAgreedRates({
    userId: req.user._id,
    userType: req.user.userType,
    timezone: req.user.timezone,
    page,
    limit,
    status,
    supplier,
    customer,
    jobType,
  });
}, "AgreedRates_fetched_successfully");

const updateAgreedRate = sendServiceResult(
  withNotification("updated", async (req) => {
    const { rates, error } = req.body.rates
      ? parseRates(req.body.rates)
      : {};
    const effectiveFrom = parseDate(req.body.effectiveFrom);

    if (error) return { error };
    if (effectiveFrom === null) return { error: "invalid_effectiveFrom" };

    return AgreedRateService.updateAgreedRate({
      id: req.params.id,
      supplier: req.user._id,
      rates,
      effectiveFrom,
      timezone: req.user.timezone,
    });
  }),
  "AgreedRate_updated_successfully",
);

const withdrawAgreedRate = sendServiceResult(
  withNotification("withdrawn", async (req) =>
    AgreedRateService.withdrawAgreedRate({
      id: req.params.id,
      supplier: req.user._id,
      timezone: req.user.timezone,
    }),
  ),
  "AgreedRate_withdrawn_successfully",
);

// accept / reject / review, taken from the route.
const respondToAgreedRate = (action, successKey) =>
  sendServiceResult(
    withNotification(action, async (req) => {
      let requestedRates;
      if (action === "review" && req.body.requestedRates) {
        const parsed = parseRates(req.body.requestedRates);
        if (parsed.error) return { error: parsed.error };
        requestedRates = parsed.rates;
      }

      return AgreedRateService.respondToAgreedRate({
        id: req.params.id,
        customer: req.user._id,
        action,
        note: req.body.note,
        requestedRates,
        timezone: req.user.timezone,
      });
    }),
    successKey,
  );

module.exports = {
  createAgreedRate,
  getAgreedRates,
  updateAgreedRate,
  withdrawAgreedRate,
  acceptAgreedRate: respondToAgreedRate(
    "accept",
    "AgreedRate_accepted_successfully",
  ),
  rejectAgreedRate: respondToAgreedRate(
    "reject",
    "AgreedRate_rejected_successfully",
  ),
  requestAgreedRateReview: respondToAgreedRate(
    "review",
    "AgreedRate_review_requested_successfully",
  ),
};
