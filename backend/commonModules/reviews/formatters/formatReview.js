const moment = require("moment-timezone");
const { getFullImageUrl } = require("@helperUtils/imageHelper");

// const formatReview = (review, timezone = "UTC") => {
//   if (!review) return null;

//   const reviewObject = review.toObject ? review.toObject() : { ...review };
//   reviewObject.timesince = moment(reviewObject.createdAt)
//     .tz(timezone)
//     .fromNow();

//   if (reviewObject.subject) {
//     reviewObject.subject.profileIcon = getFullImageUrl(
//       reviewObject.subject.profileIcon ?? "",
//     );
//   }

//   if (reviewObject.objectUser) {
//     reviewObject.objectUser.profileIcon = getFullImageUrl(
//       reviewObject.objectUser.profileIcon ?? "",
//     );
//   }

//   return reviewObject;
// };
const formatReview = (reviews, timezone = "UTC") => {

  return reviews.map((review) => {
    // Convert Mongoose document to plain object if needed
    const reviewObject = review.toObject ? review.toObject() : { ...review };

    // Compute timesince
    reviewObject.timesince = moment(reviewObject.createdAt)
      .tz(timezone)
      .fromNow();

    // Format profile icons
    if (reviewObject.subject) {
      reviewObject.subject.profileIcon = getFullImageUrl(
        reviewObject.subject.profileIcon ?? "",
      );
    }
    if (reviewObject.objectUser) {
      reviewObject.objectUser.profileIcon = getFullImageUrl(
        reviewObject.objectUser.profileIcon ?? "",
      );
    }

    // Format each question in reviewTemplate
    const formattedTemplate = (reviewObject.reviewTemplate || []).map((ans) => {
      const question = ans.question || {};

      // Map all options with labels/values
      const allOptions = (ans.option || []).map((optId) => {
        const opt = question.options?.find(
          (o) => o._id.toString() === optId.toString(),
        );
        return opt
          ? { _id: opt._id, label: opt.label, value: opt.value }
          : { _id: optId }; // fallback
      });

      // Map selected options with labels/values
      const selectedOptions = (ans.selectedOption || []).map((optId) => {
        const opt = question.options?.find(
          (o) => o._id.toString() === optId.toString(),
        );
        return opt
          ? { _id: opt._id, label: opt.label, value: opt.value }
          : { _id: optId };
      });

      return {
        _id: ans._id,
        type: ans.type,
        question: {
          _id: question._id,
          question: question.question,
          type: question.type,
          order: question.order,
          status: question.status,
        },
        options: allOptions,
        selectedOptions: selectedOptions,
      };
    });

    return {
      _id: reviewObject._id,
      reviewType: reviewObject.reviewType,
      objectType: reviewObject.objectType,
      object: reviewObject.object,
      bookingId: reviewObject.bookingId,
      subject: reviewObject.subject,
      objectUser: reviewObject.objectUser,
      rating: reviewObject.rating,
      comment: reviewObject.comment,
      createdAt: reviewObject.createdAt,
      updatedAt: reviewObject.updatedAt,
      reviewTemplate: formattedTemplate,
      timesince: reviewObject.timesince,
    };
  });
};





const addFullImageToUser = (user) => {
  if (!user) return user;

  return {
    ...user,

    profileIcon: getFullImageUrl(user.profileIcon || "noimage.png"),
  };
};

const formatReviewPhoto = (review) => {
  const obj = review.toObject ? review.toObject() : { ...review };

  return {
    ...obj,

    subject: addFullImageToUser(obj.subject),

    objectUser: addFullImageToUser(obj.objectUser),
  };
};

const formatReviews = (reviews = []) => {
  return reviews.map(formatReviewPhoto);
};


const getReviewTemplateScoring = (reviews = []) => {
  const ALL_CATEGORIES = [
    "communication",
    "personalAdaptation",
    "problemSolving",
    "planClarity",
    "goalAlignment",
  ];

  // initialize all categories with 0
  const categoryCounts = ALL_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = 0;
    return acc;
  }, {});

  let totalQuestions = 0;

  reviews.forEach((review) => {
    const templates = review.reviewTemplate || [];

    templates.forEach((q) => {
      const category = q?.category;

      totalQuestions += 1;

      if (categoryCounts.hasOwnProperty(category)) {
        categoryCounts[category] += 1;
      } else {
        // optional fallback for unknown categories
        categoryCounts["uncategorized"] =
          (categoryCounts["uncategorized"] || 0) + 1;
      }
    });
  });

  return {
    totalQuestions,
    categoryCounts,
  };
};
module.exports = { formatReviewPhoto, formatReviews, getReviewTemplateScoring };
