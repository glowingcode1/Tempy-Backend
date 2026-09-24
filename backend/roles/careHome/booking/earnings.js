const mongoose = require("mongoose");
const moment = require("moment-timezone");

const Booking = require("./Booking");
const {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
} = require("@helperUtils/constants");
const { customerTypes } = require("../../../models/UserModel");
const { formatShiftToTimezone } = require("@helperUtils/responseUtil");
const {
  getFullImageUrl,
  withFullProfileIcon,
} = require("@helperUtils/imageHelper");

/*
 * What a booking is worth, and to whom.
 *
 * One booking carries one agreed price — the accepted bid — and the platform
 * takes its cut out of it:
 *
 *   payment.amount      gross, what the customer pays
 *   payment.platformFee the platform's cut, in money
 *   payment.totalAmount amount - platformFee, what the supply side receives
 *
 * So a customer's figure is spend and reads payment.amount, while a
 * supplier's is earning and reads payment.totalAmount. Every earnings screen
 * resolves through here, so none of them can disagree.
 *
 * What is deliberately NOT counted: a shift a nurse worked for an agency.
 * There the agency is the supplier and is paid payment.totalAmount; the nurse
 * is its employee and is paid a wage the platform never sees. Counting it for
 * both would report the same money twice, so those shifts are reported
 * separately as a count rather than folded in or dropped silently.
 */

// Work done: the money is earned.
const EARNED_STATUSES = ["completed"];

/*
 * Booked but not yet worked. Worth its own figure — "what is coming" is the
 * question a supplier actually asks — but never added to what was earned.
 */
const UPCOMING_STATUSES = ["pending", "active", "inProgress"];

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(String(id));

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const formatMoney = (amount) =>
  DEFAULT_CURRENCY_SYMBOL +
  round(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/*
 * Which side of the deal this account is on, and therefore which booking
 * field points at them and which money field is theirs.
 */
const ROLES = {
  customer: { role: "customer", type: "spend", ownerField: "user" },
  nurse: { role: "nurse", type: "earning", ownerField: "worker" },
  supplier: { role: "supplier", type: "earning", ownerField: "employer" },
};

const resolveRole = (userType, role) => {
  /*
   * An explicit role wins. The supplier dashboard needs it: it can be opened
   * by an admin with ?userId=, so the caller's own userType says nothing
   * about which side of the booking the figures are for.
   */
  if (role && ROLES[role]) return ROLES[role];

  if (customerTypes.includes(userType)) {
    return { role: "customer", type: "spend", ownerField: "user" };
  }

  if (userType === "nurse") {
    return { role: "nurse", type: "earning", ownerField: "worker" };
  }

  if (userType === "agency" || userType === "homeCareCompany") {
    return { role: "supplier", type: "earning", ownerField: "employer" };
  }

  // Admins and anything else are not a party to a booking.
  return null;
};

const amountExpr = (role) =>
  role === "customer" ? "$payment.amount" : "$payment.totalAmount";

/*
 * A nurse's own earnings are the shifts they took directly. Shifts an agency
 * assigned them belong to the agency's total, not theirs.
 */
const directOnly = (role) => (role === "nurse" ? { employer: null } : {});

const shiftDateRange = (from, to) => {
  if (!from && !to) return null;

  const range = {};

  if (from) range.$gte = new Date(from);

  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
};

const sumStage = (role) => ({
  $group: {
    _id: null,
    amount: { $sum: { $ifNull: [amountExpr(role), 0] } },
    platformFee: { $sum: { $ifNull: ["$payment.platformFee", 0] } },
    hours: { $sum: { $ifNull: ["$payment.totalHours", 0] } },
    bookings: { $sum: 1 },
  },
});

const emptyBucket = () => ({
  amount: 0,
  formatted: formatMoney(0),
  hours: 0,
  bookings: 0,
});

const shapeBucket = (rows) => {
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) return emptyBucket();

  return {
    amount: round(row.amount),
    formatted: formatMoney(row.amount),
    hours: round(row.hours),
    bookings: row.bookings,
  };
};

/*
 * The whole earnings picture for one account, in one round trip.
 *
 * from/to narrow the headline total; the week and month buckets are always
 * the current ones in the viewer's timezone, because that is what the home
 * screens show beside it.
 */
const getEarningsSummary = async ({
  userId,
  userType,
  role: roleOverride,
  timezone = "UTC",
  from,
  to,
}) => {
  const resolved = resolveRole(userType, roleOverride);

  const now = moment.tz(timezone || "UTC");
  const monthStart = now.clone().startOf("month");
  const weekStart = now.clone().startOf("isoWeek");

  const periods = {
    thisMonth: monthStart.format("MMMM YYYY"),
    thisWeek: weekStart.format("DD MMM") + " - " + now.format("DD MMM"),
  };

  if (!resolved) {
    return {
      role: "none",
      type: "earning",
      currency: DEFAULT_CURRENCY,
      symbol: DEFAULT_CURRENCY_SYMBOL,
      total: emptyBucket(),
      upcoming: emptyBucket(),
      thisWeek: { ...emptyBucket(), period: periods.thisWeek },
      thisMonth: { ...emptyBucket(), period: periods.thisMonth },
    };
  }

  const { role, type, ownerField } = resolved;

  const mine = {
    [ownerField]: toObjectId(userId),
    ...directOnly(role),
  };

  const range = shiftDateRange(from, to);

  const monthRange = {
    $gte: monthStart.clone().utc().toDate(),
    $lt: monthStart.clone().add(1, "month").utc().toDate(),
  };

  const weekRange = {
    $gte: weekStart.clone().utc().toDate(),
    $lt: weekStart.clone().add(1, "week").utc().toDate(),
  };

  const facet = {
    total: [
      {
        $match: {
          status: { $in: EARNED_STATUSES },
          ...(range ? { "shift.date": range } : {}),
        },
      },
      sumStage(role),
    ],
    upcoming: [
      {
        $match: {
          status: { $in: UPCOMING_STATUSES },
          ...(range ? { "shift.date": range } : {}),
        },
      },
      sumStage(role),
    ],
    thisMonth: [
      {
        $match: {
          status: { $in: EARNED_STATUSES },
          "shift.date": monthRange,
        },
      },
      sumStage(role),
    ],
    thisWeek: [
      {
        $match: {
          status: { $in: EARNED_STATUSES },
          "shift.date": weekRange,
        },
      },
      sumStage(role),
    ],
  };

  /*
   * The shifts left out of a nurse's total, so the app can explain the gap
   * rather than leave them wondering where the money went.
   */
  if (role === "nurse") {
    facet.agencySupplied = [
      {
        $match: {
          status: { $in: EARNED_STATUSES },
          employer: { $ne: null },
          ...(range ? { "shift.date": range } : {}),
        },
      },
      sumStage(role),
    ];
  }

  /*
   * One $match up front and $facet over it, so every bucket is guaranteed to
   * be about the same person and the collection is scanned once.
   *
   * agencySupplied is the exception: it must look past the employer filter
   * that directOnly applies, so it is counted in its own query.
   */
  const [[result], agencyRows] = await Promise.all([
    Booking.aggregate([{ $match: mine }, { $facet: facet }]),
    role === "nurse"
      ? Booking.aggregate([
          {
            $match: {
              worker: toObjectId(userId),
              employer: { $ne: null },
              status: { $in: EARNED_STATUSES },
              ...(range ? { "shift.date": range } : {}),
            },
          },
          sumStage(role),
        ])
      : Promise.resolve([]),
  ]);

  const summary = {
    role,
    type,
    currency: DEFAULT_CURRENCY,
    symbol: DEFAULT_CURRENCY_SYMBOL,
    total: shapeBucket(result?.total),
    upcoming: shapeBucket(result?.upcoming),
    thisWeek: { ...shapeBucket(result?.thisWeek), period: periods.thisWeek },
    thisMonth: { ...shapeBucket(result?.thisMonth), period: periods.thisMonth },
  };

  /*
   * A customer's spend is the gross. Showing what of it the platform kept and
   * what reached the supplier saves them doing the subtraction.
   */
  if (role === "customer") {
    const platformFee = round(result?.total?.[0]?.platformFee || 0);
    const paidToSuppliers = round(summary.total.amount - platformFee);

    summary.breakdown = {
      platformFee,
      platformFeeFormatted: formatMoney(platformFee),
      paidToSuppliers,
      paidToSuppliersFormatted: formatMoney(paidToSuppliers),
    };
  }

  if (role === "nurse") {
    const agency = shapeBucket(agencyRows);

    /*
     * Deliberately no amount: that money is the agency's, and what the nurse
     * is paid for these shifts is settled off the platform.
     */
    summary.agencySupplied = {
      bookings: agency.bookings,
      hours: agency.hours,
    };
  }

  return summary;
};

const PARTY_FIELDS = "name profileIcon companyName accountState.userType";

/*
 * The bookings behind the earned total, newest shift first: the same
 * account, statuses and from/to range, so the rows add up to `total`.
 * Each row carries this account's side of the money, like the totals do.
 */
const getEarningsHistory = async ({
  userId,
  userType,
  role: roleOverride,
  timezone = "UTC",
  from,
  to,
  page = 1,
  limit = 10,
}) => {
  const resolved = resolveRole(userType, roleOverride);

  if (!resolved) return { history: [], total: 0 };

  const { role, ownerField } = resolved;
  const range = shiftDateRange(from, to);

  const match = {
    [ownerField]: toObjectId(userId),
    ...directOnly(role),
    status: { $in: EARNED_STATUSES },
    ...(range ? { "shift.date": range } : {}),
  };

  const [bookings, total] = await Promise.all([
    Booking.find(match)
      .select(
        "status shift snapshot.name snapshot.image payment user worker employer",
      )
      .sort({ "shift.date": -1, "shift.startTime": -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([
        { path: "user", select: PARTY_FIELDS },
        { path: "worker", select: PARTY_FIELDS },
        { path: "employer", select: PARTY_FIELDS },
      ])
      .lean(),
    Booking.countDocuments(match),
  ]);

  const history = bookings.map((booking) => {
    const payment = booking.payment || {};
    const amount =
      role === "customer" ? payment.amount : payment.totalAmount;

    return {
      _id: booking._id,
      status: booking.status,
      jobName: booking.snapshot?.name || "",
      jobImage: booking.snapshot?.image
        ? getFullImageUrl(booking.snapshot.image)
        : "",
      shift: formatShiftToTimezone(booking.shift, timezone),
      hours: round(payment.totalHours),
      rate: round(payment.perHour),
      amount: round(amount),
      formatted: formatMoney(amount),
      platformFee: round(payment.platformFee),
      paymentStatus: payment.status || "pending",
      customer: withFullProfileIcon(booking.user),
      worker: withFullProfileIcon(booking.worker),
      // The agency or home care company, or null for a nurse's own booking.
      employer: withFullProfileIcon(booking.employer),
    };
  });

  return { history, total };
};

module.exports = {
  EARNED_STATUSES,
  UPCOMING_STATUSES,
  formatMoney,
  resolveRole,
  getEarningsSummary,
  getEarningsHistory,
};
