const AvailabilityRepo = require("./availabilityRepository");
const formatAvailabilityToTimezone = require("./formator/formatAvailabilityToTimezone");
const {
  getActiveStaffIds,
  isActiveStaffOf,
} = require("../staff/staffRepository");

// Suppliers that employ staff and plan their time.
const STAFF_EMPLOYERS = ["agency", "homeCareCompany"];

/*
 * Whose availability the requester may see and change: a nurse their own,
 * an agency or home care company its active staff's, an admin anyone's.
 */
const canManageUser = async (requester, targetUserId) => {
  if (!targetUserId) return false;
  if (requester.userType === "admin") return true;

  if (requester.userType === "nurse") {
    return String(requester._id) === String(targetUserId);
  }

  if (STAFF_EMPLOYERS.includes(requester.userType)) {
    return isActiveStaffOf(requester._id, targetUserId);
  }

  return false;
};

// The users a listing covers when none is named.
const defaultUsersFor = async (requester) => {
  if (requester.userType === "nurse") return [requester._id];
  if (STAFF_EMPLOYERS.includes(requester.userType)) {
    return getActiveStaffIds(requester._id);
  }
  return null;
};

const createAvailability = async (data, requester) => {
  if (!(await canManageUser(requester, data.user))) {
    return { error: "Unauthorized_to_manage_availability", statusCode: 403 };
  }

  return AvailabilityRepo.createAvailability(data);
};

const getAvailability = async (
  { timezone, page, limit, status, user, startDate, endDate, summary },
  requester,
) => {
  let users;

  if (user) {
    if (!(await canManageUser(requester, user))) {
      return { error: "Unauthorized_to_manage_availability", statusCode: 403 };
    }
    users = [user];
  } else {
    users = await defaultUsersFor(requester);
    if (!users) {
      return { error: "Unauthorized_to_manage_availability", statusCode: 403 };
    }
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const params = { page, limit, status, users, startDate, endDate, skip };

  if (summary) {
    return AvailabilityRepo.getAvailabilitySummary(params);
  }

  const { availability, meta } = await AvailabilityRepo.getAvailability(params);

  return {
    availability: availability.map((a) =>
      formatAvailabilityToTimezone(a, timezone),
    ),
    meta,
  };
};

const updateAvailability = async (id, data, requester) => {
  const availability = await AvailabilityRepo.findAvailabilityById_(id);

  // Someone else's entry is reported as missing rather than confirmed.
  if (!availability || !(await canManageUser(requester, availability.user))) {
    return null;
  }

  const updateData = Object.fromEntries(
    Object.entries({
      status: data.status,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
    }).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updateData).length === 0) {
    return availability;
  }

  const startDateTime = new Date(
    updateData.startDateTime || availability.startDateTime,
  );
  const endDateTime = new Date(
    updateData.endDateTime || availability.endDateTime,
  );

  // Checked against the merged values: changing only one end can invert it.
  if (startDateTime >= endDateTime) {
    return { error: "startDateTime_must_be_before_endDateTime" };
  }

  if (updateData.startDateTime || updateData.endDateTime) {
    const duplicate = await AvailabilityRepo.findOverlappingAvailability({
      user: availability.user,
      startDateTime,
      endDateTime,
      excludeId: availability._id,
    });

    if (duplicate) {
      return { error: "Availability_overlaps_with_existing_entry" };
    }
  }

  Object.assign(availability, updateData);
  await availability.save();

  return availability;
};

const deleteAvailability = async (id, requester) => {
  if (!id) throw new Error("Availability ID is required");

  const availability = await AvailabilityRepo.findAvailabilityById_(id, {
    user: 1,
  });

  if (!availability || !(await canManageUser(requester, availability.user))) {
    return false;
  }

  const deleted = await AvailabilityRepo.deleteAvailability(id);
  return !!deleted;
};

module.exports = {
  createAvailability,
  getAvailability,
  updateAvailability,
  deleteAvailability,
};
