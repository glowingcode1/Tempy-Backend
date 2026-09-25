const mongoose = require("mongoose");

const Booking = require("../../careHome/booking/Booking");
const Job = require("../../careHome/job/Job");
const { customerTypes } = require("@UsersModel");
const {
  EARNED_STATUSES,
  UPCOMING_STATUSES,
} = require("../../careHome/booking/earnings");

/*
 * Activity figures for the admin's user screens: what a supplier has worked
 * and has coming up, what a customer has posted and booked.
 *
 *   supplier  { totalBookings, completedJobs, activeShifts }
 *   customer  { jobsPosted, totalBookings }
 *
 * Cancelled bookings are left out of totalBookings. When a nurse declines an
 * agency assignment that booking is cancelled and the shift is re-assigned
 * as a new one, so counting cancellations would count one shift twice.
 */
const CANCELLED_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

/*
 * The booking field that points at each kind of supplier. A nurse's figures
 * include shifts an agency assigned them: these are counts of work, not
 * money, so unlike earnings nothing is counted twice.
 */
const SUPPLIER_BOOKING_FIELD = {
  agency: "employer",
  homeCareCompany: "employer",
  nurse: "worker",
};

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const countBookingsBy = async (field, ids) => {
  if (!ids.length) return new Map();

  const rows = await Booking.aggregate([
    {
      $match: {
        [field]: { $in: ids },
        status: { $nin: CANCELLED_STATUSES },
      },
    },
    {
      $group: {
        _id: `$${field}`,
        totalBookings: { $sum: 1 },
        completedJobs: {
          $sum: { $cond: [{ $in: ["$status", EARNED_STATUSES] }, 1, 0] },
        },
        activeShifts: {
          $sum: { $cond: [{ $in: ["$status", UPCOMING_STATUSES] }, 1, 0] },
        },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), row]));
};

const countJobsPosted = async (ids) => {
  if (!ids.length) return new Map();

  const rows = await Job.aggregate([
    { $match: { user: { $in: ids }, status: { $ne: "deleted" } } },
    { $group: { _id: "$user", jobsPosted: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.jobsPosted]));
};

/*
 * Stats for a page of users, keyed by user id. One aggregation per booking
 * field rather than one per user. Admins and other non-parties get no entry.
 */
const getUserActivityStats = async (users = []) => {
  const userType = (user) => user.accountState?.userType;
  const idsWhere = (predicate) =>
    users
      .filter((user) => predicate(userType(user)))
      .map((user) => toObjectId(user._id));

  const customerIds = idsWhere((type) => customerTypes.includes(type));

  const [byEmployer, byWorker, byCustomer, jobsPosted] = await Promise.all([
    countBookingsBy(
      "employer",
      idsWhere((type) => SUPPLIER_BOOKING_FIELD[type] === "employer"),
    ),
    countBookingsBy(
      "worker",
      idsWhere((type) => SUPPLIER_BOOKING_FIELD[type] === "worker"),
    ),
    countBookingsBy("user", customerIds),
    countJobsPosted(customerIds),
  ]);

  const stats = new Map();

  for (const user of users) {
    const id = String(user._id);
    const field = SUPPLIER_BOOKING_FIELD[userType(user)];

    if (field) {
      const row = (field === "employer" ? byEmployer : byWorker).get(id);
      stats.set(id, {
        totalBookings: row?.totalBookings || 0,
        completedJobs: row?.completedJobs || 0,
        activeShifts: row?.activeShifts || 0,
      });
    } else if (customerTypes.includes(userType(user))) {
      stats.set(id, {
        jobsPosted: jobsPosted.get(id) || 0,
        totalBookings: byCustomer.get(id)?.totalBookings || 0,
      });
    }
  }

  return stats;
};

module.exports = { getUserActivityStats };
