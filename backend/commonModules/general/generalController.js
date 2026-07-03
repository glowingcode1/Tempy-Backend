const {
  getMealPlanTemplateWSummary,
} = require("../../roles/coach/mealPlanTemplates/mealPlanTemplatesRepository");
const {
  getTrainingPlanTemplateWSummary,
} = require("../../roles/coach/trainingPlanTemplates/trainingPlanTemplatesRepository");
const mongoose = require("mongoose");
const {
  getCheckInTemplateWSummary,
} = require("../../roles/coach/checkInTemplates/checkInTemplatesRepository");
const {
  getSupplementPlanTemplateWSummary,
} = require("../../roles/coach/supplementPlanTemplates/supplementPlanTemplatesRepository");
const {
  getReadableErrorMessage,
  sendResponse,
} = require("@helperUtils/responseUtil");
const {
  getDocumentsTemplateWSummary,
} = require("../../roles/coach/documentsTemplates/documentsTemplatesRepository");
const {
  getEarningsSummary,
} = require("../../roles/user/bookings/bookingsRepository");
const {
  getCoachesForHome,
} = require("../../roles/user/suggestedCoaches/suggestedCoachesRepository");
const { formatCoachForHome } = require("./formator/formatCoachForHome");
const {
  getUsersOnboardingResponseById,
} = require("../../roles/admin/onboardingAndFilters/coachOnboardingResponses/coachOnboardingResponsesService");
const { getUserDetails } = require("../../roles/admin/usersManagement/usersService");
const { formatUserResponse } = require("@helperUtils/userResponseUtil");
const { getReview } = require("../reviews/reviewService");
const getPlans = async (req, res) => {
  try {
    const user = req.user._id;
    let { type, page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const allowedTypes = [
      "training_plan",
      "meal_plan",
      "document",
      "supplement_plan",
      "checkin_template",
    ];
    if (!allowedTypes.includes(type)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_plan_type",
      });
    }
    if (type === "checkin_template") {
      const { data, meta } = await getCheckInTemplateWSummary({
        user,
        page,
        limit,
      });
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "checkin_templates_fetched",
        data,
        meta,
      });
    }
    if (type === "training_plan") {
      const { data, meta } = await getTrainingPlanTemplateWSummary({
        user,
        page,
        limit,
      });
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "training_plan_templates_fetched",
        data,
        meta,
      });
    }
    if (type === "meal_plan") {
      const { data, meta } = await getMealPlanTemplateWSummary({
        user,
        page,
        limit,
      });
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "meal_plan_templates_fetched",
        data,
        meta,
      });
    }
    if (type === "document") {
      const { data, meta } = await getDocumentsTemplateWSummary({
        user,
        page,
        limit,
      });
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "documents_templates_fetched",
        data,
        meta,
      });
    }
    if (type === "supplement_plan") {
      const { data, meta } = await getSupplementPlanTemplateWSummary({
        user,
        page,
        limit,
      });
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "supplement_plan_templates_fetched",
        data,
        meta,
      });
    }
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
const getEarnings = async (req, res) => {
  try {
    const coach = req.user._id;
    let { user, page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    if (!user) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "user_id_required",
      });
    }
    const { data, meta } = await getEarningsSummary({
      coach,
      user,
      page,
      limit,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "earnings_fetched",
      data,
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
const getCoaches = async (req, res) => {
  const { keyword } = req.query;

  const result = await getCoachesForHome({ keyword });
  const formattedCoaches = (result.coaches || []).map(formatCoachForHome);

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "coaches_fetched",
    data: formattedCoaches,
  });
};

const getCoacheDetails = async (req, res) => {
  let { id } = req.params;
  id = new mongoose.Types.ObjectId(id);

  let [onBoarding, user, review] = await Promise.all([
    getUsersOnboardingResponseById(id),
    getUserDetails(id),
    getReview({ objectUser: id })
  ]);
  user = formatUserResponse(user);

  if (!onBoarding||!user) {
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "coaches_fetched",
      data: [],
    });
  }
  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "coaches_fetched",
    data:{ onBoarding, user, review },
  });
};

module.exports = {
  getPlans,
  getEarnings,
  getCoaches,
  getCoacheDetails,
};
