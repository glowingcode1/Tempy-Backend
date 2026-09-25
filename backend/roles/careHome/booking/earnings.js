const mongoose = require("mongoose");
const moment = require("moment-timezone");

const Booking = require("./Booking");
const JobRole = require("../../admin/jobRole/JobRole");
const Branches = require("../../aggency/branches/Branches");
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


// Work done: the money is earned.
const EARNED_STATUSES = ["completed"];


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


const ROLES = {
  customer: { role: "customer", type: "spend", ownerField: "user" },
  nurse: { role: "nurse", type: "earning", ownerField: "worker" },
  supplier: { role: "supplier", type: "earning", ownerField: "employer" },
};

const resolveRole = (userType, role) => {

  
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


const directOnly = (role) => (role === "nurse" ? { employer: null } : {});

const shiftDateRange = (from, to) => {
  if (!from && !to) return null;

  const range = {};

  if (from) range.$gte = new Date(from);

  if (to) {
    const end = new Date(to);
    // Shift dates are kept at UTC midnight, so the day ends in UTC too.
    end.setUTCHours(23, 59, 59, 999);
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

// Charts group by the stored shift date, a UTC-midnight day, so in UTC;
// only "which day is today" comes from the viewer's timezone.
const safeZone = (timezone) =>
  timezone && moment.tz.zone(timezone) ? timezone : "UTC";

// A viewer's local calendar day, as the UTC-midnight date shifts are kept at.
const asShiftDate = (localMoment) =>
  moment.utc(localMoment.format("YYYY-MM-DD"));

// Earned bookings of one account whose shift date is in [start, end).
const earnedMatch = ({ resolved, userId, start, end }) => ({
  [resolved.ownerField]: toObjectId(userId),
  ...directOnly(resolved.role),
  status: { $in: EARNED_STATUSES },
  "shift.date": { $gte: start.toDate(), $lt: end.toDate() },
});

const moneyFields = (role) => ({
  amount: { $sum: { $ifNull: [amountExpr(role), 0] } },
  hours: { $sum: { $ifNull: ["$payment.totalHours", 0] } },
  bookings: { $sum: 1 },
});

// Earned money per month over the last `months` months, oldest first.
const getEarningsGraph = async ({
  userId,
  userType,
  role: roleOverride,
  timezone = "UTC",
  months = 12,
}) => {
  const resolved = resolveRole(userType, roleOverride);

  const firstMonth = asShiftDate(
    moment.tz(safeZone(timezone)).startOf("month"),
  ).subtract(months - 1, "months");

  const buckets = Array.from({ length: months }, (_, i) =>
    firstMonth.clone().add(i, "months"),
  );

  const rows = resolved
    ? await Booking.aggregate([
        {
          $match: earnedMatch({
            resolved,
            userId,
            start: firstMonth,
            end: firstMonth.clone().add(months, "months"),
          }),
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$shift.date" } },
            ...moneyFields(resolved.role),
          },
        },
      ])
    : [];

  const byMonth = new Map(rows.map((row) => [row._id, row]));

  const points = buckets.map((month) => {
    const row = byMonth.get(month.format("YYYY-MM"));

    return {
      month: month.format("YYYY-MM"),
      label: month.format("MMM"),
      amount: round(row?.amount),
      formatted: formatMoney(row?.amount),
      hours: round(row?.hours),
      bookings: row?.bookings || 0,
    };
  });

  const total = round(points.reduce((sum, point) => sum + point.amount, 0));

  return {
    type: resolved?.type || "earning",
    currency: DEFAULT_CURRENCY,
    symbol: DEFAULT_CURRENCY_SYMBOL,
    total,
    formatted: formatMoney(total),
    categories: points.map((point) => point.label),
    series: [
      {
        name: resolved?.type === "spend" ? "Spend" : "Earnings",
        data: points.map((point) => point.amount),
      },
    ],
    points,
  };
};

const PAYMENT_STATUSES =
  Booking.schema.path("payment").schema.path("status").enumValues;

// A daily chart past a year is no longer something a screen can draw.
const MAX_DAILY_DAYS = 366;

const moneyBucket = (row) => ({
  amount: round(row?.amount),
  formatted: formatMoney(row?.amount),
  hours: round(row?.hours),
  bookings: row?.bookings || 0,
});

// The job role title per JobRole id, for the ids given.
const getJobRoleTitles = async (ids) => {
  const unique = [...new Set(ids.filter(Boolean).map(String))];

  if (!unique.length) return new Map();

  const roles = await JobRole.find({ _id: { $in: unique } })
    .select("title")
    .lean();

  return new Map(roles.map((jobRole) => [String(jobRole._id), jobRole.title]));
};

// Same length as from..to, ending the day before `from`.
const previousRange = (from, to) => {
  if (!from || !to) return null;

  const start = moment.utc(from, "YYYY-MM-DD");
  const days = moment.utc(to, "YYYY-MM-DD").diff(start, "days") + 1;

  if (days < 1) return null;

  return {
    from: start.clone().subtract(days, "days").format("YYYY-MM-DD"),
    to: start.clone().subtract(1, "day").format("YYYY-MM-DD"),
  };
};

/*
 * Over the same earned bookings and from/to range as `total`:
 *   summary     total and one bucket per payment.status, plus `previous`
 *   daily       per shift date in from..to (this month when no range)
 *   topWorkers  agency / home care company only, else null
 */
const getEarningsBreakdown = async ({
  userId,
  userType,
  role: roleOverride,
  timezone = "UTC",
  from,
  to,
}) => {
  const resolved = resolveRole(userType, roleOverride);

  const today = moment.tz(safeZone(timezone));
  const start = from
    ? moment.utc(from, "YYYY-MM-DD")
    : asShiftDate(today.clone().startOf("month"));
  const last = to
    ? moment.utc(to, "YYYY-MM-DD")
    : asShiftDate(today.clone().endOf("month"));
  const days = last.diff(start, "days") + 1;
  const dailyWanted = days > 0 && days <= MAX_DAILY_DAYS;

  const shapeSummary = (rows) => {
    const summary = { total: moneyBucket(null) };
    const totals = { amount: 0, hours: 0, bookings: 0 };

    PAYMENT_STATUSES.forEach((status) => {
      const row = rows.find((item) => item._id === status);

      summary[status] = moneyBucket(row);
      totals.amount += Number(row?.amount) || 0;
      totals.hours += Number(row?.hours) || 0;
      totals.bookings += row?.bookings || 0;
    });

    summary.total = moneyBucket(totals);

    return summary;
  };

  if (!resolved) {
    return {
      summary: { ...shapeSummary([]), previous: null },
      daily: null,
      topWorkers: null,
    };
  }

  const { role, ownerField } = resolved;

  const earnedIn = (range) => ({
    [ownerField]: toObjectId(userId),
    ...directOnly(role),
    status: { $in: EARNED_STATUSES },
    ...(range ? { "shift.date": range } : {}),
  });

  const byPaymentStatus = (range) =>
    Booking.aggregate([
      { $match: earnedIn(range) },
      {
        $group: {
          _id: { $ifNull: ["$payment.status", "pending"] },
          ...moneyFields(role),
        },
      },
    ]);

  const range = shiftDateRange(from, to);
  const previous = previousRange(from, to);

  const [currentRows, previousRows, dailyRows, workerRows] = await Promise.all(
    [
      byPaymentStatus(range),

      previous
        ? byPaymentStatus(shiftDateRange(previous.from, previous.to))
        : Promise.resolve(null),

      dailyWanted
        ? Booking.aggregate([
            {
              $match: earnedMatch({
                resolved,
                userId,
                start,
                end: last.clone().add(1, "day"),
              }),
            },
            {
              $group: {
                _id: {
                  day: {
                    $dateToString: { format: "%Y-%m-%d", date: "$shift.date" },
                  },
                  status: { $ifNull: ["$payment.status", "pending"] },
                },
                ...moneyFields(role),
              },
            },
          ])
        : Promise.resolve([]),

      role === "supplier"
        ? Booking.aggregate([
            { $match: earnedIn(range) },
            {
              $group: {
                _id: "$worker",
                ...moneyFields(role),
                jobRoles: { $push: "$snapshot.type" },
              },
            },
            { $sort: { amount: -1, bookings: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, profileIcon: 1 } }],
                as: "worker",
              },
            },
            {
              $unwind: { path: "$worker", preserveNullAndEmptyArrays: true },
            },
          ])
        : Promise.resolve(null),
    ],
  );

  const summary = {
    ...shapeSummary(currentRows),
    previous: previousRows
      ? { ...shapeSummary(previousRows), ...previous }
      : null,
  };

  let daily = null;

  if (dailyWanted) {
    const dates = Array.from({ length: days }, (_, i) =>
      start.clone().add(i, "days"),
    );

    const sumFor = (key, status) =>
      round(
        dailyRows
          .filter(
            (row) =>
              row._id.day === key && (!status || row._id.status === status),
          )
          .reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      );

    const keys = dates.map((date) => date.format("YYYY-MM-DD"));

    daily = {
      from: keys[0],
      to: keys[keys.length - 1],
      categories: dates.map((date) => date.format("ddd DD")),
      dates: keys,
      series: [
        { name: "Earned", data: keys.map((key) => sumFor(key)) },
        { name: "Paid", data: keys.map((key) => sumFor(key, "paid")) },
        { name: "Pending", data: keys.map((key) => sumFor(key, "pending")) },
      ],
      bookings: keys.map((key) =>
        dailyRows
          .filter((row) => row._id.day === key)
          .reduce((sum, row) => sum + row.bookings, 0),
      ),
    };
  }

  let topWorkers = null;

  if (workerRows) {
    const titles = await getJobRoleTitles(
      workerRows.flatMap((row) => row.jobRoles || []),
    );

    // The role they worked most often in the range.
    const mainRole = (ids = []) => {
      const counts = new Map();

      ids.filter(Boolean).forEach((id) => {
        counts.set(String(id), (counts.get(String(id)) || 0) + 1);
      });

      const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);

      return top ? titles.get(top[0]) || null : null;
    };

    topWorkers = workerRows.map((row) => ({
      worker: {
        ...withFullProfileIcon(
          row.worker || { _id: row._id, name: "", profileIcon: "" },
        ),
        jobRole: mainRole(row.jobRoles),
      },
      ...moneyBucket(row),
      // Share of the whole range's total, not just of the five listed.
      sharePercent: summary.total.amount
        ? round((row.amount / summary.total.amount) * 100)
        : 0,
    }));
  }

  return { summary, daily, topWorkers };
};

const PARTY_FIELDS = "name profileIcon companyName accountState.userType";

// Short, stable and human-readable; bookings have no sequence number.
const bookingReference = (id) => `SH-${String(id).slice(-6).toUpperCase()}`;

/*
 * The bookings behind the earned total, newest shift first: the same
 * account, statuses and from/to range, so the rows add up to `total`.
 * Each row carries this account's side of the money, like the totals do.
 * workerId and paymentStatus narrow the rows only.
 */
const getEarningsHistory = async ({
  userId,
  userType,
  role: roleOverride,
  timezone = "UTC",
  from,
  to,
  workerId,
  paymentStatus,
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
    ...(workerId ? { worker: toObjectId(workerId) } : {}),
    ...(paymentStatus ? { "payment.status": paymentStatus } : {}),
  };

  const [bookings, total] = await Promise.all([
    Booking.find(match)
      .select(
        "status shift branch snapshot.name snapshot.image snapshot.location snapshot.branch snapshot.type payment user worker employer",
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

  // Booking.branch and the job's branch both ref "Branch", but the model is
  // registered as "Branches", so they are looked up here, not populated.
  const [titles, branches] = await Promise.all([
    getJobRoleTitles(bookings.map((booking) => booking.snapshot?.type)),
    Branches.find({
      _id: {
        $in: bookings
          .map((booking) => booking.branch || booking.snapshot?.branch)
          .filter(Boolean),
      },
    })
      .select("name location")
      .lean(),
  ]);

  const branchById = new Map(
    branches.map((branch) => [String(branch._id), branch]),
  );

  const history = bookings.map((booking) => {
    const payment = booking.payment || {};
    const amount =
      role === "customer" ? payment.amount : payment.totalAmount;

    const branch = branchById.get(
      String(booking.branch || booking.snapshot?.branch),
    );
    const jobLocation = booking.snapshot?.location || {};

    const worker = withFullProfileIcon(booking.worker);

    return {
      _id: booking._id,
      reference: bookingReference(booking._id),
      status: booking.status,
      jobName: booking.snapshot?.name || "",
      jobImage: booking.snapshot?.image
        ? getFullImageUrl(booking.snapshot.image)
        : "",
      shift: formatShiftToTimezone(booking.shift, timezone),
      // The branch the shift is at, else the job's own site (an individual
      // customer has an address, not a branch).
      location: {
        name:
          branch?.name ||
          jobLocation.title ||
          booking.user?.companyName ||
          booking.user?.name ||
          "",
        address:
          branch?.location?.fullAddress || jobLocation.fullAddress || "",
      },
      hours: round(payment.totalHours),
      rate: round(payment.perHour),
      amount: round(amount),
      formatted: formatMoney(amount),
      platformFee: round(payment.platformFee),
      paymentStatus: payment.status || "pending",
      customer: withFullProfileIcon(booking.user),
      // jobRole is the role the shift was booked for.
      worker: worker
        ? {
            ...worker,
            jobRole: titles.get(String(booking.snapshot?.type)) || null,
          }
        : worker,
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
  getEarningsGraph,
  getEarningsBreakdown,
  PAYMENT_STATUSES,
};
