const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const StaffRepo = require("./staffRepository");
const { cache, invalidate } = require("@redisCache");
const { registerUserUtility } = require("../../../controllers/authUtil");
const formatStaff = require("./formator/formatStaff");
const {
  getAllUsers,
} = require("../../../roles/admin/usersManagement/usersService");
const {
  getUserDetailsForQRRepo,
  findUserById,
  findUserByStaff,
} = require("../../../roles/admin/usersManagement/usersRepository");
const {
  isFavorite,
  favoriteStaff,
} = require("../../../commonModules/favorite/favoriteRepository");
const { findAddressByUser } = require("../../nurse/address/addressRepository");
const {
  findReviewByUser,
  findReviewByStaff,
} = require("../../../commonModules/reviews/reviewRepository");
const {
  findBookingByUserId,
  filterFreeStaff,
} = require("../../../roles/careHome/booking/bookingRepository");
const { formatStaffProfile } = require("./formator/formatStaffProfile");
const { findBidById_ } = require("../bid/bidRepository");
const {
  getWeeklyHours,
} = require("../../../roles/careHome/booking/bookingRepository");
const { formatStaffList } = require("./formator/formatStaffList");
const getAllNurses = async ({ timezone, page, limit, keyword, status }) => {
  const { users, meta } = await getAllUsers({
    page,
    limit,
    keyword,
    status,
  });
  return { staff: users, meta };
};
const createStaff = async (data, req, res) => {
  if (data.staff) {
    const existing = await getUserDetailsForQRRepo(data.staff);

    if (!existing) {
      return { error: "staff_not_found" };
    }

    if (existing.userType !== "nurse") {
      return { error: "selected_user_is_not_a_nurse" };
    }

    // Check if this nurse is already associated with this agency
    const existingStaff = await StaffRepo.findStaffByUserAndStaff(
      data.user,
      data.staff,
    );

    if (existingStaff) {
      if (existingStaff.status === "pending") {
        return { error: "staff_request_already_pending" };
      }

      if (existingStaff.status === "active") {
        return { error: "staff_already_active" };
      }

      if (
        existingStaff.status === "left" ||
        existingStaff.status === "deleted"
      ) {
        // Allow agency to send a new request
        existingStaff.status = "pending";
        existingStaff.branch = data.branch;
        existingStaff.speciality = data.speciality;
        existingStaff.ratePerHour = data.ratePerHour;
        existingStaff.platformPercent = data.platformPercent;

        await existingStaff.save();

        return existingStaff;
      }
    }

    data.name = existing.name;
    data.email = existing.email;
    data.profileIcon = existing.profileIcon;

    // Existing nurse must wait for confirmation
    data.status = "pending";

    const staffRecord = await StaffRepo.createStaff(data);

    if (!staffRecord) {
      return { error: "Staff_creation_failed" };
    }

    return staffRecord;
  }

  // New nurse registration flow
  const staff = await registerUserUtility(req, res, true);

  if (!staff || staff.responseSent || staff.error) {
    return staff;
  }

  if (staff.success) {
    data.staff = staff.user.basicInfo._id;
  }

  data.status = "pending";

  const staffRecord = await StaffRepo.createStaff(data);

  return staffRecord;
};

const getStaff = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  customer,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (customer) {
    const { staff, meta } = await StaffRepo.getStaffCustomer({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      customer,
      skip,
    });
    const formatedStaff = staff.map((job) => {
      return formatStaff(job, timezone, customer);
    });
    return { staff: formatedStaff, meta };
  }

  const { staff, meta } = await StaffRepo.getStaff({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    customer,
    skip,
  });
  const formatedStaff = staff.map((job) => {
    return formatStaff(job, timezone);
  });
  return { staff: formatedStaff, meta };
};

const updateStaff = async (id, data) => {
  const Staff = await StaffRepo.findStaffById_(id);

  if (!Staff) {
    return { error: "Staff_not_found" };
  }

  const allowedFields = [
    "name",
    "phoneNumber",
    "dob",
    "gender",
    "speciality",
    "ratePerHour",
    "platformPercent",
    "status",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Staff;
  }

  Object.assign(Staff, updateData);
  await Staff.save();

  return Staff;
};

const getStaffDetails = async (id, user, timezone, customer, supplier) => {
  const [staff, favorite, address, reviews, bookings, staffMember] =
    await Promise.all([
      findUserById(id),
      isFavorite(user, id),
      findAddressByUser(id, (limit = 3)),
      findReviewByUser(id),
      findBookingByUserId(id, user, customer),
      StaffRepo.findStaffByUserAndStaff(user, id),
    ]);
  let error = "";
  if (!staff) {
    error = "staff_not_found";
    return { error };
  }
  if (staff.userType !== "nurse") {
    error = "this_user_is_not_a_staff_member";
    return { error };
  }
  const basicInfo = {
    phoneNumber: staffMember ? staffMember.phoneNumber : staff.phoneNumber,
    acountState: staff.accountState,
    name: staffMember ? staffMember.name : staff.name,
    email: staffMember ? staffMember.email : staff.email,
    profileIcon: staff.profileIcon,
    gender: staff.gender,
    isFavorite: favorite,
    taxNumber: staff.taxNumber,
  };
  let staffDetails = null;
  if (staffMember) {
    staffDetails = {
      speciality: staffMember ? staffMember.speciality : staff.speciality,
      ratePerHour: staffMember ? staffMember.ratePerHour : staff.ratePerHour,
      platformPercent: staffMember
        ? staffMember.platformPercent
        : staff.platformPercent,
      status: staffMember ? staffMember.status : staff.status,
      joinedAt: staffMember.createdAt,
    };
  }
  const documentation = {
    governmentIdentity: staff.governmentIdentity,
    degree: staff.degree,
    certification: staff.certification,
  };
  const formatted = formatStaffProfile({
    basicInfo,
    documentation,
    staffDetails,
    address,
    reviews,
    bookings,
  });

  return { formatted, error };
};
const deleteStaff = async (id) => {
  if (!id) throw new Error("Staff ID is required");
  const deleted = await StaffRepo.deleteStaff(id);
  return !!deleted;
};

const getAvailableStaff = async ({ timezone, page, limit, user, bid, job }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [bidDocument, jobDetails] = await Promise.all([
    findBidById_(bid, { shift: 1, job: 1, user: 1 }),
    StaffRepo.findJobById_(job, { location: 1 }),
  ]);
  if (!bidDocument) return { error: "bid_not_found" };
  if (!jobDetails) return { error: "job_not_found" };

  const agencyId = bidDocument.user;
  const staff = await StaffRepo.findStaffNearJob(agencyId, jobDetails, 50);
  if (!staff?.length) return { error: "no_staff_available_nearby" };
  console.log("staff", staff);

  const availableStaff = await filterFreeStaff(staff, bidDocument.shift);
  if (!availableStaff?.length)
    return { error: "no_staff_available_for_this_shift" };
  const [favorite, reviews, users, weeklyHours] = await Promise.all([
    favoriteStaff(user, availableStaff),
    findReviewByStaff(availableStaff),
    findUserByStaff(availableStaff),
    getWeeklyHours(availableStaff),
  ]);
  const formattedStaff = formatStaffList(users, {
    favoriteStaff: favorite,
    reviews,
    weeklyHours,
    job: jobDetails,
  });

  return { staff: formattedStaff };
};

const respondToStaffRequest = async ({ staffRecordId, nurseId, action }) => {
  const staffRecord = await StaffRepo.findStaffRequestById(staffRecordId);

  if (!staffRecord) {
    return {
      error: "staff_request_not_found",
      statusCode: 404,
    };
  }

  // Security check:
  // Only the nurse who received this request can accept/reject it.
  if (staffRecord.staff.toString() !== nurseId.toString()) {
    return {
      error: "not_authorized_for_this_staff_request",
      statusCode: 403,
    };
  }

  // Request must still be pending
  if (staffRecord.status !== "pending") {
    return {
      error: "staff_request_already_responded",
      statusCode: 400,
    };
  }

  if (action === "accept") {
    staffRecord.status = "active";
  }

  if (action === "reject") {
    staffRecord.status = "left";
  }

  await staffRecord.save();

  return staffRecord;
};

const getMyStaffRequests = async ({ nurseId, page, limit }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  return StaffRepo.getMyStaffRequests({
    nurseId,
    page,
    limit,
    skip,
  });
};

module.exports = {
  createStaff,
  getStaff,
  getAvailableStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
  respondToStaffRequest,
  getMyStaffRequests,
};
