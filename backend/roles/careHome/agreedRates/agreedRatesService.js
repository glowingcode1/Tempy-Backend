const mongoose = require("mongoose");
const AgreedRate = require("./AgreedRates");
const { CUSTOMER_TYPES, SUPPLIER_TYPES, OPEN_STATUSES } = AgreedRate;
const { User } = require("@UsersModel");
const { generateMeta } = require("@helperUtils/responseUtil");
const formatAgreedRateToTimezone = require("./formator/formatAgreedRatesToTimezone");

const PARTY_FIELDS = "name email profileIcon accountState.userType";

const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

const populateRate = (query) =>
  query
    .populate("supplier", PARTY_FIELDS)
    .populate("customer", PARTY_FIELDS)
    .populate("jobType", "title department status");

const format = (rate, timezone) =>
  formatAgreedRateToTimezone(rate?.toObject ? rate.toObject() : rate, timezone);

const createAgreedRate = async ({
  supplier,
  supplierType,
  customer,
  jobType,
  rates,
  effectiveFrom,
  timezone,
}) => {
  const customerUser = await User.findById(customer, "accountState").lean();
  if (!CUSTOMER_TYPES.includes(customerUser?.accountState?.userType)) {
    return { error: "Customer_must_be_care_home_or_individual" };
  }

  // One open offer per customer and role; a change waits for the last one.
  const openOffer = await AgreedRate.exists({
    supplier,
    customer,
    jobType,
    status: { $in: OPEN_STATUSES },
  });
  if (openOffer) {
    return { error: "AgreedRate_offer_already_open" };
  }

  const agreedRate = new AgreedRate({
    supplier,
    supplierType,
    customer,
    jobType,
    rates,
    effectiveFrom: effectiveFrom || new Date(),
  });

  return saveAndFormat(agreedRate, timezone);
};

// Scopes a query to the side of the rate the requester is on.
const partyFilter = ({ userId, userType }) => {
  if (SUPPLIER_TYPES.includes(userType)) {
    return { supplier: new mongoose.Types.ObjectId(userId) };
  }
  if (userType === "admin") return {};
  return { customer: new mongoose.Types.ObjectId(userId) };
};

const getAgreedRates = async ({
  userId,
  userType,
  timezone,
  page,
  limit,
  status,
  supplier,
  customer,
  jobType,
}) => {
  const filter = {
    ...(status && { status }),
    ...(supplier && { supplier }),
    ...(customer && { customer }),
    ...(jobType && { jobType }),
    // Both sides see the rates between them.
    ...partyFilter({ userId, userType }),
  };

  const [rates, total] = await Promise.all([
    populateRate(AgreedRate.find(filter))
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AgreedRate.countDocuments(filter),
  ]);

  return {
    data: rates.map((rate) => format(rate, timezone)),
    meta: generateMeta(page, limit, total),
  };
};

/*
 * The rate that applies on a given date: the latest accepted offer whose
 * start date has arrived. A newer offer the customer hasn't accepted yet, or
 * one starting later, doesn't change it.
 */
const getCurrentRate = async ({
  supplier,
  customer,
  jobType,
  at = new Date(),
}) =>
  AgreedRate.findOne({
    supplier,
    customer,
    jobType,
    status: "accepted",
    effectiveFrom: { $lte: at },
  })
    .sort({ effectiveFrom: -1 })
    .lean();

// Loads a rate and checks the requester is on the given side of it.
const findOwnRate = async (id, side, userId) => {
  const rate = await AgreedRate.findById(id);
  return rate && sameId(rate[side], userId) ? rate : null;
};

const saveAndFormat = async (rate, timezone) => {
  await rate.save();
  const fresh = await populateRate(AgreedRate.findById(rate._id)).lean();
  return { data: format(fresh, timezone) };
};

// Supplier changes an offer the customer hasn't agreed to yet.
const updateAgreedRate = async ({
  id,
  supplier,
  rates,
  effectiveFrom,
  timezone,
}) => {
  const rate = await findOwnRate(id, "supplier", supplier);
  if (!rate) return null;

  if (!OPEN_STATUSES.includes(rate.status)) {
    return { error: "AgreedRate_not_editable" };
  }

  if (rates) rate.rates = rates;
  if (effectiveFrom) rate.effectiveFrom = effectiveFrom;

  // Back to the customer with the new numbers.
  rate.status = "pending";
  return saveAndFormat(rate, timezone);
};

// Supplier pulls an offer, with no penalty.
const withdrawAgreedRate = async ({ id, supplier, timezone }) => {
  const rate = await findOwnRate(id, "supplier", supplier);
  if (!rate) return null;

  if (!OPEN_STATUSES.includes(rate.status)) {
    return { error: "AgreedRate_not_withdrawable" };
  }

  rate.status = "withdrawn";
  return saveAndFormat(rate, timezone);
};

// Customer accepts, rejects or asks for a lower rate.
const respondToAgreedRate = async ({
  id,
  customer,
  action,
  note,
  requestedRates,
  timezone,
}) => {
  const rate = await findOwnRate(id, "customer", customer);
  if (!rate) return null;

  if (rate.status !== "pending") {
    return { error: "AgreedRate_not_awaiting_response" };
  }

  if (action === "review") {
    rate.status = "reviewRequested";
    rate.review = {
      note: note || "",
      requestedRates,
      requestedAt: new Date(),
    };
  } else {
    rate.status = action === "accept" ? "accepted" : "rejected";
  }

  rate.respondedAt = new Date();
  return saveAndFormat(rate, timezone);
};

module.exports = {
  createAgreedRate,
  getAgreedRates,
  getCurrentRate,
  updateAgreedRate,
  withdrawAgreedRate,
  respondToAgreedRate,
};
