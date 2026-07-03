const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const AddressService = require("./addressService");

const createAddress = async (req, res) => {
  let { location } = req.body;
  console.log("req.body", req.body);
  const user = req.user._id;

  if (
    !validateParams(req, res, {
      rawData: ["location"],
    })
  )
    return;

  let data = {
    location,
    user,
  };
  try {
    const Address = await AddressService.createAddress(data);
    if (!Address) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Address_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Address_created_successfully",
      data: Address,
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
const getAddress = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, user } = req.query;
  try {
    const timezone = req.user.timezone;
    let type = req.user.userType;
    if (type === "admin") {
      type = null;
      if (!user) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "user_id_required",
        });
      }
    } else {
      user = req.user._id;
    }
    const { addresss, meta } = await AddressService.getAddress({
      page,
      limit,
      keyword,
      status,
      user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Addresss_fetched_successfully",
      data: addresss,
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
const updateAddress = async (req, res) => {
  const { id } = req.params;
  let { location, status } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    user,
    location,
    status,
  };
  try {
    const updated = await AddressService.updateAddress(id, data);
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

const deleteAddress = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await AddressService.deleteAddress(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Address_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Address_deleted_successfully",
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
  createAddress,
  getAddress,
  updateAddress,
  deleteAddress,
};
