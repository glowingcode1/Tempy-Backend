const reviewService = require("./reviewService");
const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("@helperUtils/responseUtil");
const mongoose = require("mongoose");
const resolveError = (error) => {
  if (error?.statusCode) {
    return error;
  }

  return getReadableErrorMessage(error);
};

const createReview = async (req, res) => {
  // Validate basic fields
  if (
    !validateParams(req, res, {
      rawData: ["reviewType", "objectId", "rating"],
      objectIdFields: ["objectId"],
      enumFields: {
        reviewType: ["booking", "user", "branch"],
      },
    })
  )
    return;

  const { reviewType, objectId, rating, comment = "" } = req.body;
  const currentUserId = req.user._id;

  // Validate rating
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_rating",
    });
  }

  const reviewData = {
    reviewType,
    objectId,
    rating,
    comment,
    currentUserId,
  };
  const timezone = req.user?.timezone || "UTC";

  try {
    const review = await reviewService.createReview({ reviewData, timezone });
    if (review instanceof Error) {
      return sendResponse({
        res,

        statusCode: review.statusCode || 400,

        translationKey: review.message,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "review_created",
      data: review,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "internal_server_error",
      error,
    });
  }
};

const getReviewsByType = async (req, res) => {
  if (
    !validateParams(req, res, {
      pathParams: ["reviewType", "entityId"],
      objectIdFields: ["entityId"],
      enumFields: {
        reviewType: ["booking", "user", "branch"],
      },
    })
  ) {
    return;
  }

  const { page, limit } = parsePaginationParams(req);

  try {
    const { reviews, meta } = await reviewService.getReviewsByType({
      reviewType: req.params.reviewType,
      entityId: req.params.entityId,
      page,
      limit,
      timezone: req.user?.timezone || "UTC",
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reviews_fetched",
      data: reviews,
      meta,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const getReviewById = async (req, res) => {
  if (
    !validateParams(req, res, {
      pathParams: ["reviewId"],
      objectIdFields: ["reviewId"],
    })
  ) {
    return;
  }

  try {
    const { review } = await reviewService.getReviewById({
      reviewId: req.params.reviewId,
      timezone: req.user?.timezone || "UTC",
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_fetched",
      data: review,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const updateReviewById = async (req, res) => {
  if (
    !validateParams(req, res, {
      pathParams: ["reviewId"],
      objectIdFields: ["reviewId"],
    })
  ) {
    return;
  }

  try {
    const { review } = await reviewService.updateReviewById({
      reviewId: req.params.reviewId,
      userId: req.user._id,
      rating: req.body.rating,
      comment: req.body.comment,
      timezone: req.user?.timezone || "UTC",
      userType: req.user?.userType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_updated",
      data: review,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const deleteReviewById = async (req, res) => {
  if (
    !validateParams(req, res, {
      pathParams: ["reviewId"],
      objectIdFields: ["reviewId"],
    })
  ) {
    return;
  }

  try {
    await reviewService.deleteReviewById({
      reviewId: req.params.reviewId,
      userId: req.user._id,
      userType: req.user?.userType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_deleted",
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const getReview = async (req, res) => {
  if (
    !validateParams(req, res, {
      pathParams: ["user"],
      objectIdFields: ["user"],
    })
  ) {
    return;
  }
  const { page, limit } = parsePaginationParams(req);

  try {
    const { reviews, meta } = await reviewService.getReview({
      objectUser: req.params.user,
      page,
      limit,
      timezone: req.user?.timezone || "UTC",
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reviews_fetched",
      data: reviews,
      meta,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const getallReview = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, reviewType, bookingId, object, subject } = req.query;
  const isAdmin = req.user?.userType === "admin";
  let objectUser = req.query.user || req.user._id;
  if (isAdmin) {
    objectUser = null;
  }
  if (subject) {
    if (!req.user._id.equals(subject)) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "unauthorized_to_perform_this_action",
      });
    }
    objectUser = null;
  }
  try {
    const { reviews, meta } = await reviewService.getallReview({
      page,
      limit,
      keyword,
      timezone: req.user?.timezone || "UTC",
      objectUser,
      reviewType,
      bookingId,
      object,
      subject,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reviews_fetched",
      data: reviews,
      meta,
    });
  } catch (error) {
    const readableError = resolveError(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
module.exports = {
  createReview,
  getReviewsByType,
  getReviewById,
  updateReviewById,
  deleteReviewById,
  getReview,
  getallReview,
};
