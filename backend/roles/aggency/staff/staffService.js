const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const StaffRepo = require("./staffRepository");
const { cache, invalidate } = require("@redisCache");
const { registerUserUtility } = require("../../../controllers/authUtil");
const formatStaff = require("./formator/formatStaff");
const { getAllUsers } = require("../../../roles/admin/usersManagement/usersService");
const { getUserDetailsForQRRepo } = require("../../../roles/admin/usersManagement/usersRepository");



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
  if(data.staff) {
    const existing = await getUserDetailsForQRRepo(data.staff);

    data.name = existing.name;
    data.email = existing.email;
    data.profileIcon = existing.profileIcon;
    const staffRecord = await StaffRepo.createStaff(data);
    return staffRecord;
  }
  else{
  const staff = await registerUserUtility(req, res);
  if(!staff || staff.responseSent||staff.error) {
    return staff;
  }
  if(staff.success) {
  data.staff = staff.user.basicInfo._id;
  }
  const staffRecord = await StaffRepo.createStaff(data);
  return staffRecord; 
  }
  return null;
};

const getStaff = async ({ timezone, page, limit, keyword, status, user }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const { staff, meta } = await StaffRepo.getStaff({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
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

const getStaffDetails = async (id, timezone) => {
  const Staff = await StaffRepo.findStaffById(id);

  if (!Staff) {
    return null;
  }

  return formatStaffToTimezone(Staff, timezone);
};
const deleteStaff = async (id) => {
  if (!id) throw new Error("Staff ID is required");
  const deleted = await StaffRepo.deleteStaff(id);
  return !!deleted;
};

module.exports = {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
};
