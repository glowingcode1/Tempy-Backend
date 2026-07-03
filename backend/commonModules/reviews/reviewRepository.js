const mongoose = require("mongoose");
const Review = require("./Review");
const ReviewTemplate = require("../../roles/admin/reviewTemplate/ReviewTemplate");
const { formatReviews, getReviewTemplateScoring } = require("./formatters/formatReview");
const { default: isEmail } = require("validator/lib/isEmail");

const castAggregationFilter = (filter = {}) => {
  const cast = { ...filter };
  const objectIdFields = ["object", "bookingId", "subject", "objectUser"];
  for (const field of objectIdFields) {
    if (
      cast[field] &&
      mongoose.isValidObjectId(cast[field]) &&
      typeof cast[field] === "string"
    ) {
      cast[field] = new mongoose.Types.ObjectId(cast[field]);
    }
  }
  return cast;
};

const reviewPopulate = [
  {
    path: "subject",
    select: "name profileIcon",
  },
  {
    path: "objectUser",
    select: "name profileIcon",
  },
];

const createReview = async (data = {}) => {
  const created = await Review.create(data);
  return Review.findById(created._id);
};

const findReviewByUniqueScope = async ({ bookingId, subject, object }) => {
  return Review.findOne({ bookingId, subject, object });
};
/**
 * Enrich reviews with question details and selectedOptionDetails
 * @param {Array} reviews - Array of review objects from DB
 */
const enrichReviewsWithSelectedFlag = async (reviews) => {
  if (!reviews || !reviews.length) return [];

  // 1️⃣ Collect all unique question IDs
  const questionIdsSet = new Set();
  reviews.forEach((review) => {
    review.reviewTemplate?.forEach((answer) => {
      if (answer.question) questionIdsSet.add(answer.question.toString());
    });
  });
  const questionIds = Array.from(questionIdsSet);
  if (!questionIds.length) return reviews;

  // 2️⃣ Fetch all questions with their options
  const questionsData = await ReviewTemplate.find({ _id: { $in: questionIds } })
    .select("question type options category")
    .lean();

  const questionsMap = {};
  questionsData.forEach((q) => {
    questionsMap[q._id.toString()] = q;
  });

  // 3️⃣ Enrich each review
  const enrichedReviews = reviews.map((review) => {
    review.reviewTemplate = review.reviewTemplate?.map((answer) => {
      const questionData = questionsMap[answer.question.toString()];
      if (!questionData) return answer;

      // Build options with selected flag
      const optionsWithSelected = (questionData.options || []).map((opt) => ({
        _id: opt._id,
        label: opt.label,
        value: opt.value,
        selected:
          answer.selectedOption?.some((sel) => sel.equals(opt._id)) || false,
      }));

      // Final structure for this answer
      return {
        _id: answer._id,
        question: questionData.question,
        type: questionData.type,
        category: questionData.category,
        options: optionsWithSelected,
      };
    });

    return review;
  });

  return enrichedReviews;
};

const getReviews = async (
  filter = {},
  { skip = 0, limit = 10 } = {},
  keyword,
) => {
  const searchText = keyword?.trim();

  const pipeline = [
    { $match: filter },

    // Populate reviewer
    {
      $lookup: {
        from: "users",
        localField: "subject",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, profileIcon: 1, accountState: 1, email: 1 } }],
        as: "subject",
      },
    },
    { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },

    // Populate service object
    {
      $lookup: {
        from: "coachservices",
        let: {
          objectId: "$object",
          objectType: "$objectType",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$objectId"] },
                  { $eq: ["$$objectType", "coachservices"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              serviceName: 1,
            },
          },
        ],
        as: "serviceObject",
      },
    },

    // Populate user object
    {
      $lookup: {
        from: "users",
        let: {
          objectId: "$object",
          objectType: "$objectType",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$objectId"] },
                  { $eq: ["$$objectType", "User"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              profileIcon: 1,
              email: 1,
            },
          },
        ],
        as: "userObject",
      },
    },

    {
      $addFields: {
        object: {
          $ifNull: [
            { $arrayElemAt: ["$serviceObject", 0] },
            { $arrayElemAt: ["$userObject", 0] },
          ],
        },
      },
    },

    {
      $project: {
        serviceObject: 0,
        userObject: 0,
      },
    },

    // Populate reviewed user
    {
      $lookup: {
        from: "users",
        localField: "objectUser",
        foreignField: "_id",
        pipeline: [{ $project: { name: 1, profileIcon: 1, accountState: 1, email: 1 } }],
        as: "objectUser",
      },
    },
    { $unwind: { path: "$objectUser", preserveNullAndEmptyArrays: true } },
  ];

  if (searchText) {
    pipeline.push({
      $match: {
        $or: [
          { "object.serviceName": { $regex: searchText, $options: "i" } },
          { "object.name": { $regex: searchText, $options: "i" } },
          { "subject.name": { $regex: searchText, $options: "i" } },
          { "objectUser.name": { $regex: searchText, $options: "i" } },
          { comment: { $regex: searchText, $options: "i" } },
          { quickContext: { $regex: searchText, $options: "i" } },
        ],
      },
    });
  }
  

  pipeline.push({
    $facet: {
      data: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      total: [{ $count: "count" }],
    },
  });

  const result = await Review.aggregate(pipeline);

  const reviews = result[0]?.data || [];
  const total = result[0]?.total?.[0]?.count || 0;

  const formattedReviews = await enrichReviewsWithSelectedFlag(reviews);
  const [formatedReviewsWithContext, reviewTemplateScoring] = await Promise.all([
      formatReviews(formattedReviews),
      getReviewTemplateScoring(formattedReviews),
    ]);
    console.log("reviewTemplateScoring", reviewTemplateScoring);

  return {
    reviews: formatedReviewsWithContext,
    total,
    reviewTemplateScoring,
  };
};

const getRatingStats = async (filter = {}) => {
  const result = await Review.aggregate([
    { $match: castAggregationFilter(filter) },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalCount = 0;
  let ratingSum = 0;

  for (const entry of result) {
    const star = Math.round(entry._id);
    if (star >= 1 && star <= 5) {
      ratingBreakdown[star] = entry.count;
      totalCount += entry.count;
      ratingSum += star * entry.count;
    }
  }

  return {
    totalReviews: totalCount,
    averageRating:
      totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : 0,
    ratingBreakdown,
  };
};

const findReviewById = async (id) => {
  return Review.findById(id).populate(reviewPopulate);
};

const updateReviewById = async (id, data = {}) => {
  return Review.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).populate(reviewPopulate);
};

const deleteReviewById = async (id) => {
  return Review.findByIdAndDelete(id);
};

const getEditedReviewStats = async (filter = {}) => {
  const matchStage = castAggregationFilter(filter);

  const result = await Review.aggregate([
    {
      $match: matchStage,
    },
    {
      $facet: {
        editedReviews: [
          {
            $match: {
              $expr: {
                $ne: ["$createdAt", "$updatedAt"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              rating: 1,
              comment: 1,
              quickContext: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
          {
            $sort: {
              updatedAt: -1,
            },
          },
        ],

        quickContextCount: [
          {
            $match: {
              quickContext: {
                $exists: true,
                $nin: ["", null],
              },
            },
          },
          {
            $count: "count",
          },
        ],
      },
    },
  ]);

  const editedReviews = result[0]?.editedReviews || [];

  return {
    totalEditedReviews: editedReviews.length,
    editedReviews,
    quickContextReviewsCount: result[0]?.quickContextCount?.[0]?.count || 0,
  };
};
module.exports = {
  createReview,
  findReviewByUniqueScope,
  getReviews,
  getRatingStats,
  findReviewById,
  updateReviewById,
  deleteReviewById,
  getEditedReviewStats,
};
