const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const reviewTemplateService = require("./reviewTemplateService");

const createReviewTemplate = async (req, res) => {
  const userId = req.user._id;
  const isAdmin = req.user.userType === "admin";

  if (!isAdmin) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "forbidden",
    });
  }

  const {
    question,
    type,
    options = [],
    order = 0,
    status = "active",
    userType = "general",
    category = "communication",
  } = req.body;


  // Basic validation
  if (!question || !type || !options) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "question_type_and_options_required",
    });
  }

  const ALLOWED_TYPES = ["single_select", "multi_select", "boolean"];
  if (!ALLOWED_TYPES.includes(type)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_question_type",
    });
  }

  const MAX_OPTIONS = 10;
  // Select types must have options
  if (["single_select", "multi_select"].includes(type)) {
    if (!options || options.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "options_required_for_select_type",
      });
    }
    if (options.length > MAX_OPTIONS) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: `max_${MAX_OPTIONS}_options_allowed`,
      });
    }
  }

  // Boolean → auto fix options
  const finalOptions =
    type === "boolean"
      ? [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ]
      : options.map((opt) => ({
          label: String(opt.label).trim(),
          value: String(opt.value).trim(),
        }));

  const data = {
    question: question.trim(),
    type,
    options: finalOptions,
    order,
    status,
    userType,
    category,
    createdBy: userId,
  };

  try {
    const reviewTemplate =
      await reviewTemplateService.createReviewTemplate(data);

    if (!reviewTemplate || reviewTemplate.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey:
          reviewTemplate?.error || "ReviewTemplate_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "ReviewTemplate_created_successfully",
      data: reviewTemplate,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "internal_server_error",
      error,
    });
  }
};
const getReviewTemplates = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const reviewTemplates = await reviewTemplateService.getReviewTemplates({
      userId,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReviewTemplates_fetched_successfully",
      data: reviewTemplates,
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
const updateReviewTemplate = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const isAdmin = req.user.userType === "admin";

  if (!isAdmin) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "forbidden",
    });
  }

  let { question, type, options, order, status } = req.body;

  // Prepare finalOptions if type is boolean or select type
  let finalOptions = options;
  if (type === "boolean") {
    finalOptions = [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ];
  } else if (["single_select", "multi_select"].includes(type) && Array.isArray(options)) {
    finalOptions = options.map((opt) => ({
      label: String(opt.label).trim(),
      value: String(opt.value).trim(),
    }));
  }

  // Build update object dynamically
  const data = {};
  if (question !== undefined) data.question = question.trim();
  if (type !== undefined) data.type = type;
  if(category !== undefined) data.category = category;
  if(userType !== undefined) data.userType = userType;
  if (finalOptions !== undefined) data.options = finalOptions;
  if (order !== undefined) data.order = order;
  if (status !== undefined) data.status = status;
  data.createdBy = userId; // optional: track last updater

  try {
    const updated = await reviewTemplateService.updateReviewTemplate(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ReviewTemplate_not_found",
      });
    }

    if (updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReviewTemplate_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "internal_server_error",
      error,
    });
  }
};

const deleteReviewTemplate = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await reviewTemplateService.deleteReviewTemplate(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ReviewTemplate_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReviewTemplate_deleted_successfully",
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
  createReviewTemplate,
  getReviewTemplates,
  updateReviewTemplate,
  deleteReviewTemplate,
};
