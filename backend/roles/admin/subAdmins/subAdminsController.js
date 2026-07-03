const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const subAdminsService = require("./subAdminsService");



const getPermissions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { permissions, meta } = await subAdminsService.getPermissions({
      timezone,
      page,
      limit,
      keyword,
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "permissions_fetched_successfully",
      data: permissions,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const createSubAdmins = async (req, res) => {
  const creator= req.user._id;

  if (
    !validateParams(req, res, {
      rawData: ["name", "email", "password", "userType"],
    })
  )
    return;

  try {
    const subAdmin = await subAdminsService.createSubAdmins(req, res, creator);

    if (!subAdmin) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "subadmin_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "subadmin_created_successfully",
      data: subAdmin,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const getSubAdmins = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;
  try {

    const userId = req.user._id;
    const timezone = req.user.timezone;
    let type = req.user.userType;
    if(type === "admin"){
      type=null;
    }
    const { subAdmins, meta } = await subAdminsService.getSubAdmins({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      type,
    });
 

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "SubAdmins_fetched_successfully",
      data: subAdmins,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const updateSubAdmins = async (req, res) => {
  const { id } = req.params;
  let {
    question,
    answer,
    type,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;



  let data = {
    question,
    answer,
    type,
  };
  try {
    const updated = await subAdminsService.updateSubAdmins(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const deleteSubAdmins = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await subAdminsService.deleteSubAdmins(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "SubAdmins_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "SubAdmins_deleted_successfully",
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
module.exports = {
  createSubAdmins,
  getSubAdmins,
  updateSubAdmins,
  deleteSubAdmins,
  getPermissions,
};