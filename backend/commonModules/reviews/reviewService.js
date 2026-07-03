const reviewRepository = require("./reviewRepository");
const { Services } = require("@ServicesModel");
const { User } = require("@UsersModel");
const { Bookings } = require("@BookingsModel");
const { generateMeta } = require("@helperUtils/responseUtil");
const formatReview = require("./formatters/formatReview");
const mongoose = require("mongoose");
const REVIEW_TYPE_TO_OBJECT_MODEL = {
  session: "coachservices",
  user: "User",
};

const buildAppError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
};

const getTargetModelByReviewType = (reviewType) => {
  if (reviewType === "session") {
    return Services;
  }

  return User;
};

const getReviewedUserFromBooking = (booking, currentUserId) => {
  const bookingUserId = toIdString(booking.user);
  const bookingCoachId = toIdString(booking.coach);

  if (toIdString(currentUserId) === bookingUserId) {
    return bookingCoachId;
  }

  return bookingUserId;
};

const createReview = async ({ reviewData, timezone }) => {
  const {
    reviewType,
    objectId,
    bookingId,
    quickContext,
    rating,
    comment,
    userId: currentUserId,
    reviewTemplate,
  } = reviewData;
  const targetModel = getTargetModelByReviewType(reviewType);

  const [targetObject, booking] = await Promise.all([
    targetModel.findById(objectId),
    Bookings.findById(bookingId),
  ]);

  if (!targetObject) {
    throw buildAppError(
      reviewType === "session" ? "service_not_found" : "user_not_found",
      404,
    );
  }

  if (!booking) {
    throw buildAppError("booking_not_found", 404);
  }

  const bookingUserId = toIdString(booking.user);
  const bookingCoachId = toIdString(booking.coach);
  const currentUserIdString = toIdString(currentUserId);

  if (![bookingUserId, bookingCoachId].includes(currentUserIdString)) {
    throw buildAppError("unauthorized_to_perform_this_action", 403);
  }

  if (reviewType === "session") {
    if (toIdString(booking.service) !== toIdString(objectId)) {
      throw buildAppError("service_not_found", 404);
    }
  } else {
    const reviewedUserId = getReviewedUserFromBooking(booking, currentUserId);
    if (toIdString(objectId) !== reviewedUserId) {
      throw buildAppError("user_not_found", 404);
    }
  }

  const existingReview = await reviewRepository.findReviewByUniqueScope({
    bookingId,
    subject: currentUserId,
    object: objectId,
  });

  if (existingReview) {
    throw buildAppError("review_already", 400);
  }

  if (Number(rating) < 1 || Number(rating) > 5) {
    throw buildAppError("rating_must_be_between_1_and_5", 400);
  }

  const objectUser =
    reviewType === "session"
      ? bookingCoachId
      : getReviewedUserFromBooking(booking, currentUserId);

  const createdReview = await reviewRepository.createReview({
    reviewType,
    objectType: REVIEW_TYPE_TO_OBJECT_MODEL[reviewType],
    object: objectId,
    bookingId,
    subject: currentUserId,
    objectUser,
    rating,
    comment,
    quickContext,
    reviewTemplate,
  });

  return {
    review: createdReview,
  };
};

const getReviewsByType = async ({
  reviewType,
  entityId,
  page = 1,
  limit = 10,
  timezone = "UTC",
}) => {
  const filter = {
    reviewType,
    object: new mongoose.Types.ObjectId(entityId),
    objectType: REVIEW_TYPE_TO_OBJECT_MODEL[reviewType],
  };

  const [{ reviews, total }, ratingStats] = await Promise.all([
    reviewRepository.getReviews(filter, { skip: (page - 1) * limit, limit }),
    reviewRepository.getRatingStats(filter),
  ]);

  return {
    reviews,
    // reviews: formatReview(reviews, timezone),
    meta: {
      ...generateMeta(page, limit, total),
      ratingStats: {
        totalReviews: ratingStats.totalReviews,
        averageRating: ratingStats.averageRating,
        ratingBreakdown: ratingStats.ratingBreakdown,
      },
    },
  };
};

const getReviewById = async ({ reviewId, timezone = "UTC" }) => {
  const filter = { _id: new mongoose.Types.ObjectId(reviewId) };
  const review_te = await reviewRepository.getReviews(filter, { skip: 0, limit: 10 });
  if (!review_te || review_te.reviews.length === 0) {
    throw buildAppError("review_not", 404);
  }
  return {
    review: review_te.reviews[0],
  };
};

const updateReviewById = async ({
  reviewId,
  userId,
  rating,
  comment,
  quickContext,
  timezone = "UTC",
  userType,
}) => {
  const review = await reviewRepository.findReviewById(reviewId);
  if (!review) {
    throw buildAppError("review_not", 404);
  }
  if(userType !== "admin"){
  if (toIdString(review.subject) !== toIdString(userId)) {
    throw buildAppError("unauthorized_to_perform_this_action", 403);
  }
  }
  const payload = {};

  if (rating !== undefined && rating !== null) {
    if (Number(rating) < 1 || Number(rating) > 5) {
      throw buildAppError("rating_must_be_between_1_and_5", 400);
    }
    payload.rating = rating;
  }
  if (quickContext !== undefined) {
    payload.quickContext = quickContext;
  }

  if (comment !== undefined) {
    payload.comment = comment;
  }

  if (Object.keys(payload).length === 0) {
    throw buildAppError("no_review_updates_provided", 400);
  }

  payload.updatedAt = new Date();

  const updatedReview = await reviewRepository.updateReviewById(
    reviewId,
    payload,
  );

  return {
    review: updatedReview,
  };
};

const deleteReviewById = async ({ reviewId, userId, userType }) => {
  const review = await reviewRepository.findReviewById(reviewId);

  if (!review) {
    throw buildAppError("review_not", 404);
  }

  if(userType !== "admin"){
  if (toIdString(review.subject) !== toIdString(userId)) {
    throw buildAppError("unauthorized_to_perform_this_action", 403);
  }
}

  await reviewRepository.deleteReviewById(reviewId);
};

const getReview = async ({
  objectUser,
  page = 1,
  limit = 10,
  timezone = "UTC",
}) => {
  const filter = {
    objectUser: new mongoose.Types.ObjectId(objectUser),
  };
  const [{ reviews, total, reviewTemplateScoring }, ratingStats] =
    await Promise.all([
      reviewRepository.getReviews(filter, { skip: (page - 1) * limit, limit }),
      reviewRepository.getRatingStats(filter),
    ]);

  return {
    reviews,
    // reviews: formatReview(reviews, timezone),
    meta: {
      ...generateMeta(page, limit, total),
      reviewTemplateScoring,
      ratingStats: {
        totalReviews: ratingStats.totalReviews,
        averageRating: ratingStats.averageRating,
        ratingBreakdown: ratingStats.ratingBreakdown,
      },
    },
  };
};
const getallReview = async ({ page = 1, limit = 10, timezone = "UTC",keyword }) => {
  const filter = {};
  const [{ reviews, total }, ratingStats, editedReviewStats] =
    await Promise.all([
      reviewRepository.getReviews(filter, { skip: (page - 1) * limit, limit },keyword),
      reviewRepository.getRatingStats(filter),
      reviewRepository.getEditedReviewStats(filter),
    ]);

  return {
    reviews,
    // reviews: formatReview(reviews, timezone),
    meta: {
      ...generateMeta(page, limit, total),
      ratingStats: {
        totalReviews: ratingStats.totalReviews,
        averageRating: ratingStats.averageRating,

        totalEditedReviews: editedReviewStats.totalEditedReviews,
        quickContextReviewsCount: editedReviewStats.quickContextReviewsCount,
        ratingBreakdown: ratingStats.ratingBreakdown,
      },
    },
  };
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
