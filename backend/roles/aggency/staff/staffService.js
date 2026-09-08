const {
  getCurrentDateInTimezone,
  getReadableErrorMessage,
} = require("@helperUtils/responseUtil");
const StaffRepo = require("./staffRepository");
const Branches = require("../branches/Branches");
const { User } = require("@UsersModel");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const { registerUserUtility } = require("../../../controllers/authUtil");
const formatStaff = require("./formator/formatStaff");
const crypto = require("crypto");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { sendEmailViaBrevo } = require("../../../helperUtils/emailUtil");
const {
  staffInvitationEmailTemplate,
} = require("../../../helperUtils/emailTemplates");
const { IMPORT_ACTIONS, parseStaffRow } = require("./staffImportUtil");
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
    userType: "nurse",
  });
  return { staff: users, meta };
};
const createStaff = async (data, req, res) => {
  if (data.staff) {
    const existing = await getUserDetailsForQRRepo(data.staff);

    if (!existing) {
      return { error: "staff_not_found" };
    }

    if (existing.accountState?.userType !== "nurse") {
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

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

// registerUserUtility writes straight to the HTTP response on failure, so each
// row gets a throwaway req/res pair (same approach as the DB bootstrap) and the
// captured payload is reported against that row instead.
const buildRegistrationContext = (req, body) => {
  const captured = {};

  const fakeReq = {
    body,
    query: {},
    params: {},
    header: (key) =>
      typeof req?.header === "function" ? req.header(key) : null,
  };

  const fakeRes = {
    req,
    status(statusCode) {
      captured.statusCode = statusCode;
      return this;
    },
    json(payload) {
      captured.payload = payload;
      return this;
    },
  };

  return { fakeReq, fakeRes, captured };
};

// New accounts get a throwaway password; the invite asks them to set their own
const generateTemporaryPassword = () =>
  `Tmp-${crypto.randomBytes(9).toString("base64url")}`;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A branch may be referenced by id or by name, and the same branch usually
// repeats across rows, so resolved lookups are cached for the whole import.
const resolveBranch = async (branchRef, userId, branchCache) => {
  const cacheKey = branchRef.toLowerCase();
  if (branchCache.has(cacheKey)) return branchCache.get(cacheKey);

  const scope = { user: userId, status: { $ne: "deleted" } };
  const branch = mongoose.isValidObjectId(branchRef)
    ? await Branches.findOne({ ...scope, _id: branchRef }).select("_id name")
    : await Branches.findOne({
        ...scope,
        name: new RegExp(`^${escapeRegex(branchRef)}$`, "i"),
      }).select("_id name");

  branchCache.set(cacheKey, branch);
  return branch;
};

const notifyStaffRequest = ({ staffRecord, nurseId, req, agencyName }) => {
  void sendUserNotifications({
    recipientIds: [nurseId],
    title: "New Staff Request",
    body: `You have received a new staff request from ${agencyName}.`,
    data: {
      type: NotificationTypes.NEW_BOOKING,
      objectType: "Staff",
    },
    sender: req?.user?._id,
    objectId: staffRecord._id,
    saveNotification: true,
  });
};

const sendStaffInvitationEmail = ({
  email,
  staffName,
  agencyName,
  isNewAccount,
}) => {
  // Fire and forget: a failed invitation email must not fail the row
  void sendEmailViaBrevo(
    [email],
    "You have a new staff request",
    staffInvitationEmailTemplate({
      staffName,
      agencyName,
      isNewAccount,
      email,
    }),
  );
};

// Cases 1 and 2: the email is already registered on the platform.
const inviteRegisteredUser = async ({
  existingUser,
  branch,
  data,
  userId,
  req,
  agencyName,
}) => {
  if (existingUser.accountState?.userType !== "nurse") {
    return {
      action: IMPORT_ACTIONS.FAILED,
      message: `email is registered as a ${existingUser.accountState?.userType || "non nurse"} account and cannot be added as staff`,
    };
  }

  const existingStaff = await StaffRepo.findStaffByUserAndStaff(
    userId,
    existingUser._id,
  );

  // Case 2: already part of this agency's staff -> no action taken
  if (
    existingStaff &&
    existingStaff.status !== "left" &&
    existingStaff.status !== "deleted"
  ) {
    return {
      action: IMPORT_ACTIONS.SKIPPED,
      staffId: existingStaff._id,
      message: `already part of your staff (status: ${existingStaff.status})`,
    };
  }

  // Left or removed earlier -> a fresh request may be sent, same as createStaff
  if (existingStaff) {
    existingStaff.branch = branch._id;
    existingStaff.speciality = data.speciality;
    existingStaff.ratePerHour = data.ratePerHour;
    existingStaff.platformPercent = data.platformPercent;
    existingStaff.status = "pending";

    await existingStaff.save();

    notifyStaffRequest({
      staffRecord: existingStaff,
      nurseId: existingUser._id,
      req,
      agencyName,
    });
    sendStaffInvitationEmail({
      email: existingUser.email,
      staffName: existingUser.name || data.name,
      agencyName,
      isNewAccount: false,
    });

    return {
      action: IMPORT_ACTIONS.INVITED,
      staffId: existingStaff._id,
      message: "staff request sent again",
    };
  }

  // Case 1: registered but never staff here -> send a staff request
  const staffRecord = await StaffRepo.createStaff({
    user: userId,
    staff: existingUser._id,
    branch: branch._id,
    name: existingUser.name || data.name,
    email: existingUser.email,
    profileIcon: existingUser.profileIcon,
    phoneNumber: data.phoneNumber,
    dob: data.dob,
    gender: data.gender,
    location: data.location,
    speciality: data.speciality,
    ratePerHour: data.ratePerHour,
    platformPercent: data.platformPercent,
    status: "pending",
  });

  if (!staffRecord || staffRecord.error) {
    return {
      action: IMPORT_ACTIONS.FAILED,
      message: staffRecord?.error || "Staff_creation_failed",
    };
  }

  notifyStaffRequest({
    staffRecord,
    nurseId: existingUser._id,
    req,
    agencyName,
  });
  sendStaffInvitationEmail({
    email: existingUser.email,
    staffName: existingUser.name || data.name,
    agencyName,
    isNewAccount: false,
  });

  return {
    action: IMPORT_ACTIONS.INVITED,
    staffId: staffRecord._id,
    message: "staff request sent",
  };
};

// Case 3: the email is unknown -> run the new nurse creation flow.
const createNurseAndInvite = async ({
  branch,
  data,
  userId,
  req,
  agencyName,
}) => {
  if (!data.taxNumber) {
    return {
      action: IMPORT_ACTIONS.FAILED,
      message: "taxNumber is required to create a new nurse account",
    };
  }

  const passwordWasGenerated = !data.password;
  const { fakeReq, fakeRes, captured } = buildRegistrationContext(req, {
    email: data.email,
    name: data.name,
    password: data.password || generateTemporaryPassword(),
    userType: "nurse",
    phoneNumber: data.phoneNumber,
    dob: data.dob,
    gender: data.gender,
    profileIcon: data.profileIcon,
    timezone: data.timezone || req?.user?.timezone,
    location: data.location,
    taxNumber: data.taxNumber,
    governmentIdentity: data.governmentIdentity,
    degree: data.degree,
    certification: data.certification,
  });

  const registration = await registerUserUtility(fakeReq, fakeRes, true);

  if (!registration?.success) {
    return {
      action: IMPORT_ACTIONS.FAILED,
      message:
        registration?.error ||
        captured.payload?.message ||
        "nurse account could not be created",
    };
  }

  const nurseId = registration.user.basicInfo._id;

  const staffRecord = await StaffRepo.createStaff({
    user: userId,
    staff: nurseId,
    branch: branch._id,
    name: data.name,
    email: data.email,
    profileIcon: data.profileIcon,
    phoneNumber: data.phoneNumber,
    dob: data.dob,
    gender: data.gender,
    location: data.location,
    speciality: data.speciality,
    ratePerHour: data.ratePerHour,
    platformPercent: data.platformPercent,
    status: "pending",
  });

  if (!staffRecord || staffRecord.error) {
    return {
      action: IMPORT_ACTIONS.FAILED,
      message: staffRecord?.error || "Staff_creation_failed",
    };
  }

  notifyStaffRequest({ staffRecord, nurseId, req, agencyName });
  sendStaffInvitationEmail({
    email: data.email,
    staffName: data.name,
    agencyName,
    isNewAccount: true,
  });

  return {
    action: IMPORT_ACTIONS.CREATED,
    staffId: staffRecord._id,
    nurseId,
    message: passwordWasGenerated
      ? "nurse account created, invitation sent to set a password"
      : "nurse account created and staff request sent",
  };
};

/**
 * Processes every CSV row on its own so one bad row never blocks the rest.
 * Each email lands in exactly one of three buckets:
 *   - registered but not our staff  -> staff request sent   (invited)
 *   - registered and already staff  -> no action taken      (skipped)
 *   - not registered                -> nurse created + request sent (created)
 */
const importStaff = async ({ rows, userId, req }) => {
  const branchCache = new Map();
  const results = [];
  const summary = {
    total: rows.length,
    invited: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  const agencyName = req?.user?.companyName || req?.user?.name || "an agency";

  for (const [index, rawRow] of rows.entries()) {
    // +2 so the number matches the spreadsheet row the agency is looking at
    const rowNumber = index + 2;
    const { errors, data } = parseStaffRow(rawRow);
    const entry = {
      row: rowNumber,
      email: data.email || null,
      name: data.name || null,
    };

    if (errors.length) {
      results.push({
        ...entry,
        action: IMPORT_ACTIONS.FAILED,
        message: errors.join("; "),
      });
      summary.failed += 1;
      continue;
    }

    try {
      const branch = await resolveBranch(data.branch, userId, branchCache);

      if (!branch) {
        results.push({
          ...entry,
          action: IMPORT_ACTIONS.FAILED,
          message: `branch ${data.branch} was not found for this agency`,
        });
        summary.failed += 1;
        continue;
      }

      const existingUser = await User.findOne({ email: data.email }).select(
        "name email profileIcon accountState",
      );

      const outcome = existingUser
        ? await inviteRegisteredUser({
            existingUser,
            branch,
            data,
            userId,
            req,
            agencyName,
          })
        : await createNurseAndInvite({
            branch,
            data,
            userId,
            req,
            agencyName,
          });

      results.push({ ...entry, branch: branch.name, ...outcome });
      summary[outcome.action] += 1;
    } catch (error) {
      results.push({
        ...entry,
        action: IMPORT_ACTIONS.FAILED,
        message: getReadableErrorMessage(error).message,
      });
      summary.failed += 1;
    }
  }

  return { summary, results };
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
  if (staff.acountState?.userType !== "nurse") {
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
  const formatted = formatStaffProfile(
    {
      basicInfo,
      documentation,
      staffDetails,
      address,
      reviews,
      bookings,
    },
    timezone,
  );

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
  importStaff,
  getStaff,
  getAvailableStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
  respondToStaffRequest,
  getMyStaffRequests,
};
