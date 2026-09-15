const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");
const BranchService = require("./branchesService");

const BRANCH_OWNER_TYPES = [
  "hospital",
  "localAuthority",
  "careHome",
  "agency",
  "homeCareCompany",
  "user",
];

const createBranch = async (req, res) => {
  let { name, location, bio, profileIcon, cqc, insurance, status } = req.body;
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
      rawData: ["name", "location", "bio", "profileIcon", "cqc", "insurance"],
    })
  )
    return;

  let data = {
    user,
    name,
    location,
    bio,
    profileIcon,
    cqc,
    insurance,
    status,
  };

  try {
    const branch = await BranchService.createBranch(data);
    if (!branch) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Branch_creation_failed",
      });
    }
    if (branch && branch.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: branch.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Branch_created_successfully",
      data: branch,
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

const getBranch = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user, summary } = req.query;

  const isBranchOwner = BRANCH_OWNER_TYPES.includes(req.user.userType);

  if (isBranchOwner) {
    user = req.user._id;
  } else if (req.user.userType === "admin") {
    user = null;
  } else {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "not_allowed_to_view_branches",
    });
  }

  try {
    const timezone = req.user.timezone;
    const { branch, meta } = await BranchService.getBranch({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      summary,
      currentUserId: req.user._id,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Branch_fetched_successfully",
      data: branch,
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

const updateBranch = async (req, res) => {
  const { id } = req.params;
  let { name, location, status, bio, profileIcon, cqc, insurance } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const user = req.user._id;
  const userType = req.user.userType;

  /*
   * cqc/insurance are accepted in the same nested shape createBranch takes.
   * The verified flags are deliberately left out - only an admin review
   * flips those.
   */
  let data = {
    name,
    location,
    status,
    bio,
    profileIcon,
    cqcRegistrationNumber: cqc?.registrationNumber,
    cqcCertificate: cqc?.certificate,
    insuranceCertificate: insurance?.certificate,
    insuranceExpiryDate: insurance?.expiryDate,
    user,
    userType,
  };

  try {
    const updated = await BranchService.updateBranch(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: updated.statusCode || 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Branch_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Branch_updated_successfully",
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

const getBranchDetails = async (req, res) => {
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
    const branch = await BranchService.getBranchDetails(
      id,
      timezone,
      req.user._id,
    );
    if (!branch) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Branch_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Branch_fetched_successfully",
      data: branch,
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

const deleteBranch = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await BranchService.deleteBranch(id, {
      user: req.user._id,
      userType: req.user.userType,
    });

    if (deleted && deleted.error) {
      return sendResponse({
        res,
        statusCode: deleted.statusCode || 400,
        translationKey: deleted.error,
      });
    }

    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Branch_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Branch_deleted_successfully",
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
  createBranch,
  getBranch,
  updateBranch,
  deleteBranch,
  getBranchDetails,
};
