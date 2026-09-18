const reviewRepository = require("./reviewRepository");
const { User } = require("@UsersModel");
const { Bookings } = require("@BookingsModel");
const { generateMeta } = require("@helperUtils/responseUtil");
const mongoose = require("mongoose");
const Booking = require("../../roles/careHome/booking/Booking");
const Branches = require("../../roles/aggency/branches/Branches");
const Job = require("../../roles/careHome/job/Job");

const REVIEW_TYPE_TO_OBJECT_MODEL = {
  booking: "Booking",
  user: "User",
  branch: "Branches",
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
  if (reviewType === "booking") {
    return Booking;
  }
  if (reviewType === "branch") {
    return Branches;
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

/*
 * Booking.isReviewed / Booking.review mirror the customer's review of that
 * booking, and Job.isReviewed is true while any of the job's bookings is
 * reviewed. Recomputed from the reviews themselves so create and delete
 * cannot drift apart.
 */
const syncBookingReviewFlags = async (bookingId) => {
  const booking = await Booking.findById(bookingId).select("user job");
  if (!booking) return;

  const review = await reviewRepository.findBookingReviewBy(
    booking._id,
    booking.user,
  );

  await Booking.updateOne(
    { _id: booking._id },
    { isReviewed: Boolean(review), review: review?._id || null },
  );

  if (!booking.job) return;

  const jobReviewed = await Booking.exists({
    job: booking.job,
    isReviewed: true,
  });
  await Job.updateOne(
    { _id: booking.job },
    { isReviewed: Boolean(jobReviewed) },
  );
};

const createReview = async ({ reviewData, timezone }) => {
  const { reviewType, objectId, rating, comment, currentUserId } = reviewData;
  const targetModel = getTargetModelByReviewType(reviewType);
  const targetObject = await targetModel.findById(objectId);

  if (!targetObject) {
    throw buildAppError(
      reviewType === "booking" ? "booking_not_found" : "user_not_found",
      404,
    );
  }

  if (Number(rating) < 1 || Number(rating) > 5) {
    throw buildAppError("rating_must_be_between_1_and_5", 400);
  }

  if (
    await reviewRepository.hasReview({
      subject: currentUserId,
      object: objectId,
      reviewType,
    })
  ) {
    return buildAppError("review_already", 400);
  }

  let objectUser = null;
  let bookingId = null;
  if (reviewType === "booking") {
    if (targetObject.status !== "completed") {
      return buildAppError("cannot_review_incomplete_booking", 400);
    }

    // Only the customer who made the booking can review it.
    if (toIdString(currentUserId) !== toIdString(targetObject.user)) {
      return buildAppError("unauthorized_to_perform_this_action", 403);
    }

    if (targetObject.isReviewed) {
      return buildAppError("review_already", 400);
    }

    bookingId = objectId;
    // The customer rates the nurse who worked the booking. Booking.employer
    // is the agency that bid, so it is never the reviewed party.
    objectUser = targetObject.worker;

    if (!objectUser) {
      return buildAppError("booking_has_no_counterparty_to_review", 400);
    }
  } else if (reviewType === "branch") {
    if (targetObject.status === "deleted") {
      return buildAppError("cannot_review_deleted_branch", 400);
    }
    // objectUser stays null — a branch isn't a User, so it can't fill that ref.
    // Ratings for branches are queried by object+objectType instead (see below).
    objectUser = null;

    // Optional: tie the review to the completed booking it came out of, so the
    // branch's reviews can show which job and nurse they refer to.
    if (reviewData.bookingId) {
      const booking = await Booking.findById(reviewData.bookingId);

      if (!booking) {
        return buildAppError("booking_not_found", 404);
      }
      if (booking.status !== "completed") {
        return buildAppError("cannot_review_incomplete_booking", 400);
      }
      if (toIdString(booking.branch) !== toIdString(objectId)) {
        return buildAppError("booking_does_not_belong_to_this_branch", 400);
      }

      bookingId = booking._id;
    }
  } else if (reviewType === "user") {
    objectUser = targetObject._id;
  }
  const createdReview = await reviewRepository.createReview({
    reviewType,
    objectType: REVIEW_TYPE_TO_OBJECT_MODEL[reviewType],
    object: objectId,
    bookingId,
    subject: currentUserId,
    objectUser,
    rating,
    comment,
  });

  if (reviewType === "booking") {
    await syncBookingReviewFlags(objectId);
  }

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
  currentUserId,
  onlyOwn = false,
}) => {
  const filter = {
    reviewType,
    object: new mongoose.Types.ObjectId(entityId),
    objectType: REVIEW_TYPE_TO_OBJECT_MODEL[reviewType],
    ...(onlyOwn && currentUserId
      ? { subject: new mongoose.Types.ObjectId(currentUserId) }
      : {}),
  };

  const [{ reviews, total }, ratingStats] = await Promise.all([
    reviewRepository.getReviews(filter, { skip: (page - 1) * limit, limit }),
    reviewRepository.getRatingStats(filter),
  ]);
  const hasUserReview = currentUserId
    ? await reviewRepository.hasReview({
        subject: currentUserId,
        object: entityId,
        reviewType,
      })
    : false;

  return {
    reviews,
    hasReview: hasUserReview,
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
  const review_te = await reviewRepository.getReviews(filter, {
    skip: 0,
    limit: 10,
  });
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
  timezone = "UTC",
  userType,
}) => {
  console.log("userId", userId);
  const review = await reviewRepository.findReviewById(reviewId);
  if (!review) {
    throw buildAppError("review_not", 404);
  }
  if (userType !== "admin") {
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

  if (userType !== "admin") {
    if (toIdString(review.subject) !== toIdString(userId)) {
      throw buildAppError("unauthorized_to_perform_this_action", 403);
    }
  }

  await reviewRepository.deleteReviewById(reviewId);

  if (review.reviewType === "booking") {
    await syncBookingReviewFlags(review.object);
  }
};

const getReview = async ({
  objectUser,
  page = 1,
  limit = 10,
  timezone = "UTC",
  currentUserId,
}) => {
  const filter = {
    objectUser: new mongoose.Types.ObjectId(objectUser),
  };
  const [{ reviews, total }, ratingStats] = await Promise.all([
    reviewRepository.getReviews(filter, { skip: (page - 1) * limit, limit }),
    reviewRepository.getRatingStats(filter),
  ]);
  const hasUserReview = currentUserId
    ? await reviewRepository.hasReview({
        subject: currentUserId,
        objectUser,
      })
    : false;

  return {
    reviews,
    hasReview: hasUserReview,
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
const getallReview = async ({
  page = 1,
  limit = 10,
  timezone = "UTC",
  keyword,
  objectUser,
  reviewType,
  bookingId,
  object,
  subject,
}) => {
  const filter = {};
  if (subject) {
    filter.subject = new mongoose.Types.ObjectId(subject);
  }
  if (objectUser) {
    filter.objectUser = new mongoose.Types.ObjectId(objectUser);
  }
  if (reviewType) {
    filter.reviewType = reviewType;
  }
  if (bookingId) {
    filter.bookingId = new mongoose.Types.ObjectId(bookingId);
  }
  if (object) {
    filter.object = new mongoose.Types.ObjectId(object);
  }
  const [{ reviews, total }, ratingStats, editedReviewStats] =
    await Promise.all([
      reviewRepository.getReviews(
        filter,
        { skip: (page - 1) * limit, limit },
        keyword,
      ),
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
