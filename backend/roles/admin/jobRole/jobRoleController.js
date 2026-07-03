const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment");
const JobRoleService = require("./jobRoleService");

const createJobRole = async (req, res) => {
  let {department,title  } = req.body;
  let user = req.user._id;
  if (
    !validateParams(req, res, {
      rawData: ["department", "title"],
    })
  )
    return;

  let data = {
    user,
    department,
    title
  };
  try {
    const jobRole = await JobRoleService.createJobRole(data);
    if (!jobRole) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "JobRole_creation_failed",
      });
    }
    if (jobRole && jobRole.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: jobRole.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "JobRole_created_successfully",
      data: jobRole,
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

const getJobRole = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user } = req.query;

  try {
    const timezone = req.user.timezone;
    const { jobRole, meta } = await JobRoleService.getJobRole({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobRole_fetched_successfully",
      data: jobRole,
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
const updateJobRole = async (req, res) => {
  const { id } = req.params;
  let { shift, job, JobRole, note, status } = req.body;
  const isAgency = req.user.userType === "agency";
  const allowedStatusesAgency = ["withdraw"];

  if (isAgency && status && !allowedStatusesAgency.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "the_status_is_not_allowed_for_agency",
    });
  }
  if (Boolean(job) !== Boolean(shift)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "both_job_and_shift_are_required",
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
    user,
    shift,
    job,
    JobRole,
    note,
    status,
  };
  try {
    const updated = await JobRoleService.updateJobRole(id, data);
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
        translationKey: "JobRole_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobRole_updated_successfully",
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

const getJobRoleDetails = async (req, res) => {
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
    const job = await JobRoleService.getJobRoleDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "JobRole_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobRole_fetched_successfully",
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
const deleteJobRole = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await JobRoleService.deleteJobRole(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "JobRole_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobRole_deleted_successfully",
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
  createJobRole,
  getJobRole,
  updateJobRole,
  deleteJobRole,
  getJobRoleDetails,
};
