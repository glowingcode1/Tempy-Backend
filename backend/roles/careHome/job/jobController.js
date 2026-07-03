const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment");
const JobService = require("./jobService");

const createJob = async (req, res) => {
  let {
    name,
    description,
    type,
    gender,
    isBreak,
    breakMin,
    shift,
    location,
  } = req.body;
  let user = req.user._id;
  const timezone = req.user.timezone;
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
      rawData: ["name", "description", "type", "gender", "shift", "location"],
    })
  )
    return;
  if (shift && !Array.isArray(shift)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "shift_must_be_array",
    });
  }
  if (req.body.isBreak && !req.body.breakMin) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "breakMin_required_when_isBreak_true",
    });
  }
  const convertedJobs = shift.map((job) => {
    if (job.perHour <= 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "perHour_must_be_greater_than_zero",
      });
    }
    const startUtc = moment
      .tz(`${job.date} ${job.startTime}`, "YYYY-MM-DD HH:mm", timezone)
      .utc();

    const endUtc = moment
      .tz(`${job.date} ${job.endTime}`, "YYYY-MM-DD HH:mm", timezone)
      .utc();

    return {
      ...job,
      date: startUtc.format("YYYY-MM-DD"),
      startTime: startUtc.format("HH:mm"),
      endTime: endUtc.format("HH:mm"),
    };
  });

  let data = {
    name,
    description,
    type,
    gender,
    isBreak,
    breakMin,
    shift: convertedJobs,
    user,
    location,
  };
  try {
    const Job = await JobService.createJob(data);
    if (!Job) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Job_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Job_created_successfully",
      data: Job,
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



const getJobs = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, user } = req.query;
  const isCareHome = req.user.userType === "careHome";
  let userType = req.user.userType;
  let requester= req.user._id
  if (isCareHome) {
    user = req.user._id;
    userType=null
  }
  try {
    const timezone = req.user.timezone;
    const { Jobs, meta } = await JobService.getJobs({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      userType,
      requester,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Jobs_fetched_successfully",
      data: Jobs,
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
const updateJob = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    description,
    type,
    gender,
    isBreak,
    breakMin,
    shift,
    location,
  } = req.body;

    if (shift && !Array.isArray(shift)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "shift_must_be_array",
      });
    }
    if (req.body.isBreak && !req.body.breakMin) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "breakMin_required_when_isBreak_true",
      });
    }
    let convertedJobs = undefined;
    if(shift && shift.length > 0){
     convertedJobs = shift.map((job) => {
      if (job.perHour <= 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "perHour_must_be_greater_than_zero",
        });
      }
      const startUtc = moment
        .tz(`${job.date} ${job.startTime}`, "YYYY-MM-DD HH:mm", timezone)
        .utc();

      const endUtc = moment
        .tz(`${job.date} ${job.endTime}`, "YYYY-MM-DD HH:mm", timezone)
        .utc();

      return {
        ...job,
        date: startUtc.format("YYYY-MM-DD"),
        startTime: startUtc.format("HH:mm"),
        endTime: endUtc.format("HH:mm"),
      };
    });
  }

  const user = req.user._id;

  let data = {
    user,
    name,
    description,
    type,
    gender,
    isBreak,
    breakMin,
    shift: convertedJobs||undefined,
    location,
  };
  try {
    const updated = await JobService.updateJob(id, data);
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
        translationKey: "Job_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_updated_successfully",
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

const getJobDetails = async (req, res) => {
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
    const job = await JobService.getJobDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Job_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_fetched_successfully",
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
const deleteJob = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await JobService.deleteJob(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Job_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_deleted_successfully",
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
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobDetails,
};
