const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const FavoriteService = require("./favoriteService");



const createFavorite = async (req, res) => {
  let { favoriteUser } = req.body;
  let user = req.user._id;
  if (req.user.userType === "admin") {
    if (!req.body.userId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "userId_required",
      });
    }
    user = req.body.userId;
  }
  
    if (
      !validateParams(req, res, {
        rawData: [
          "favoriteUser"
        ],
      })
    )
      return;

  let data = {
    user,
    favoriteUser,
  };
  try {
    const favorite = await FavoriteService.createFavorite(data, req, res);
    if (!favorite) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Favorite_creation_failed",
      });
    }
    if (favorite && favorite.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: favorite.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Favorite_created_successfully",
      data: favorite,
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

const getFavorite = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, favoriteUser } = req.query;

  const isAgency = req.user.userType === "agency";
  const homeCareCompany = req.user.userType === "homeCareCompany";
  const isAdmin = req.user.userType === "admin";
  const isCareHome = req.user.userType === "careHome";

  if (isAgency || homeCareCompany|| isCareHome) {
    user = req.user._id;
  }
  try {
    const timezone = req.user.timezone;
    const { favorite, meta } = await FavoriteService.getFavorite({
      timezone,
      page,
      limit,
      keyword,
      favoriteUser,
      user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Favorite_fetched_successfully",
      data: favorite,
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
const updateFavorite = async (req, res) => {
  const { id } = req.params;
  let { name,phoneNumber,dob,gender,speciality, ratePerHour, platformPercent, status } = req.body;
  const isAgency = req.user.userType === "agency";
  const allowedStatusesAgency = ["active","left"];

  if (isAgency && status && allowedStatusesAgency.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "the_status_is_not_allowed_for_agency",
    });
  }


  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  const user = req.user._id;

  let data = {
    name,
    phoneNumber,
    dob,
    gender,
    speciality,
    ratePerHour,
    platformPercent,
    status,
    user,
  };
  try {
    const updated = await FavoriteService.updateFavorite(id, data);
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
        translationKey: "Favorite_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Favorite_updated_successfully",
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

const getFavoriteDetails = async (req, res) => {
  const { id } = req.params;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const job = await FavoriteService.getFavoriteDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Favorite_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Favorite_fetched_successfully",
      data: job,
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
const deleteFavorite = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await FavoriteService.deleteFavorite(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Favorite_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Favorite_deleted_successfully",
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
  createFavorite,
  getFavorite,
  updateFavorite,
  deleteFavorite,
  getFavoriteDetails,
};
