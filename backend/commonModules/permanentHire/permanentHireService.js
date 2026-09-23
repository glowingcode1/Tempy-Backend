const mongoose = require("mongoose");
const PermanentHire = require("./PermanentHire");
const Booking = require("@BookingsModel");
const { User } = require("@UsersModel");
const Staff = require("../../roles/aggency/staff/Staff");
const AdminSettings = require("../../roles/admin/settings/models/AdminSettings");
const { generateMeta } = require("@helperUtils/responseUtil");
const { withFullProfileIcon } = require("@helperUtils/imageHelper");

const PARTY_FIELDS = "name email profileIcon accountState.userType";

const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

const getTempToPermSettings = async () => {
  const settings = await AdminSettings.findOne(
    {},
    "temp_to_perm_min_shifts temp_to_perm_fee",
  ).lean();
  return {
    minShifts: settings?.temp_to_perm_min_shifts || 0,
    fee: settings?.temp_to_perm_fee || 0,
  };
};

/*
 * Care home asks to hire a worker permanently. `supplier` is the agency the
 * worker came through; for a solo nurse it is the nurse themselves.
 */
const requestHire = async ({ customer, worker, supplier = worker }) => {
  const supplierUser = await User.findById(supplier, "accountState").lean();
  const supplierType = supplierUser?.accountState?.userType;

  if (supplierType === "homeCareCompany") {
    return { error: "Permanent_hire_not_allowed_for_home_care_company_staff" };
  }

  if (supplierType === "nurse") {
    if (!sameId(supplier, worker)) return { error: "Invalid_supplier" };
  } else if (supplierType === "agency") {
    const staff = await Staff.exists({
      user: supplier,
      staff: worker,
      status: "active",
    });
    if (!staff) return { error: "worker_not_active_staff_of_this_supplier" };
  } else {
    return { error: "Invalid_supplier" };
  }

  const alreadyRequested = await PermanentHire.exists({
    customer,
    worker,
    status: "pending",
  });
  if (alreadyRequested) return { error: "Permanent_hire_already_requested" };

  const [{ minShifts, fee }, shiftsWorked] = await Promise.all([
    getTempToPermSettings(),
    Booking.countDocuments({
      user: customer,
      worker,
      // A solo nurse's own bookings have no employer.
      employer: supplierType === "nurse" ? null : supplier,
      status: "completed",
    }),
  ]);

  if (shiftsWorked < minShifts) {
    return { error: "Not_enough_shifts_for_permanent_hire" };
  }

  const hire = await PermanentHire.create({
    customer,
    supplier,
    supplierType,
    worker,
    shiftsWorked,
    fee,
  });

  return { data: hire };
};

// Supplier accepts or rejects the hire.
const respondToHire = async ({ id, supplier, action }) => {
  const hire = await PermanentHire.findById(id);
  if (!hire || !sameId(hire.supplier, supplier)) return null;

  if (hire.status !== "pending") {
    return { error: "Permanent_hire_not_pending" };
  }

  if (action === "accept" && hire.supplierType === "agency") {
    // The worker leaves the agency. A solo nurse can still work elsewhere.
    await Staff.updateOne(
      { user: hire.supplier, staff: hire.worker },
      { status: "left" },
    );
  }

  hire.status = action === "accept" ? "accepted" : "rejected";
  hire.respondedAt = new Date();
  await hire.save();

  return { data: hire };
};

// Care home withdraws a request the supplier hasn't answered.
const cancelHire = async ({ id, customer }) => {
  const hire = await PermanentHire.findById(id);
  if (!hire || !sameId(hire.customer, customer)) return null;

  if (hire.status !== "pending") {
    return { error: "Permanent_hire_not_pending" };
  }

  hire.status = "cancelled";
  await hire.save();

  return { data: hire };
};

const getHires = async ({ userId, userType, status, page, limit }) => {
  const id = new mongoose.Types.ObjectId(userId);
  const filter = {
    ...(status && { status }),
    ...(userType === "careHome" && { customer: id }),
    ...(["agency", "nurse"].includes(userType) && { supplier: id }),
  };

  const [data, total] = await Promise.all([
    PermanentHire.find(filter)
      .populate("customer", PARTY_FIELDS)
      .populate("supplier", PARTY_FIELDS)
      .populate("worker", PARTY_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PermanentHire.countDocuments(filter),
  ]);

  const formatted = data.map((hire) => ({
    ...hire,
    customer: withFullProfileIcon(hire.customer),
    supplier: withFullProfileIcon(hire.supplier),
    worker: withFullProfileIcon(hire.worker),
  }));

  return { data: formatted, meta: generateMeta(page, limit, total) };
};

/*
 * Workers who have completed shifts at this care home, one row per worker and
 * agency, with how many. Solo nurses come back with no supplier; home care
 * company staff, and agency workers who are no longer active there, are left
 * out because they can't be hired.
 */
const getEligibleWorkers = async ({ customer }) => {
  const rows = await Booking.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(customer),
        status: "completed",
      },
    },
    {
      $group: {
        _id: { worker: "$worker", employer: "$employer" },
        shiftsWorked: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { id: "$_id.worker" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
          { $project: { name: 1, email: 1 } },
        ],
        as: "worker",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { id: "$_id.employer" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
          { $project: { name: 1, "accountState.userType": 1 } },
        ],
        as: "supplier",
      },
    },
    {
      $lookup: {
        from: "staffs",
        let: { worker: "$_id.worker", employer: "$_id.employer" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$staff", "$$worker"] },
                  { $eq: ["$user", "$$employer"] },
                  { $eq: ["$status", "active"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "activeStaff",
      },
    },
    { $unwind: "$worker" },
    { $sort: { shiftsWorked: -1 } },
  ]);

  return {
    data: rows.flatMap((row) => {
      const supplier = row.supplier[0];

      // No employer: a solo nurse's own booking.
      if (!row._id.employer) {
        return [
          {
            worker: row.worker,
            supplier: null,
            supplierType: "nurse",
            shiftsWorked: row.shiftsWorked,
          },
        ];
      }

      const isActiveAgencyWorker =
        supplier?.accountState?.userType === "agency" && row.activeStaff.length;
      if (!isActiveAgencyWorker) {
        return [];
      }

      return [
        {
          worker: row.worker,
          supplier: { _id: supplier._id, name: supplier.name },
          supplierType: "agency",
          shiftsWorked: row.shiftsWorked,
        },
      ];
    }),
  };
};

module.exports = {
  getEligibleWorkers,
  getTempToPermSettings,
  requestHire,
  respondToHire,
  cancelHire,
  getHires,
};
