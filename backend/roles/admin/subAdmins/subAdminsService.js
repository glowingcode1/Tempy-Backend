const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const subAdminsRepo = require("./subAdminsRepository");
const { registerUserUtility } = require("../../../controllers/authUtil");
const { formatSubAdmins } = require("./formatImage");

const createSubAdmins = async (req, res, creator) => {
  const registerResult = await registerUserUtility(req, res, {
    autoVerify: true,
    allowAdminCreation: false,
  });
  if (!registerResult || !registerResult.success) {
    throw new Error("Failed to create SubAdmin");
  }
  const data = {
    creator,
    permissions: req.body.permissions || [],
    user: registerResult.user.basicInfo._id,
  };
  const subAdmins = await subAdminsRepo.createSubAdmins(data);
  return subAdmins;
};

const getSubAdmins = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  type,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { subAdmins, meta } = await subAdminsRepo.getSubAdmins({
    timezone,
    page,
    limit,
    keyword,
    status,
    userId,
    skip,
    type,
  });

  return { subAdmins: formatSubAdmins(subAdmins, meta), meta };
};
const getPermissions = async ({ timezone, page, limit, keyword, userId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { permissions, meta } = await subAdminsRepo.getPermissions({
    timezone,
    page,
    limit,
    keyword,
    userId,
    skip,
  });

  return { permissions, meta };
};

const updateSubAdmins = async (id, data) => {
  const SubAdmins = await subAdminsRepo.findSubAdminsById(id);

  if (!SubAdmins) {
    return { error: "PromoCode_not_found" };
  }

  const allowedFields = ["question", "answer", "type", "status"];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return SubAdmins;
  }

  Object.assign(SubAdmins, updateData);
  await SubAdmins.save();



  return SubAdmins;
};

const deleteSubAdmins = async (id) => {
  if (!id) throw new Error("SubAdmin_id_required");

  const deleted = await subAdminsRepo.deleteSubAdmin(id);

  return !!deleted;
};

module.exports = {
  createSubAdmins,
  getSubAdmins,
  updateSubAdmins,
  deleteSubAdmins,
  getPermissions,
};
