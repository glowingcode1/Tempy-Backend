const mongoose = require("mongoose");
const Review = require("./Review");
const { formatReviews } = require("./formatters/formatReview");
const { getFullImageUrl } = require("@helperUtils/imageHelper");
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

/**
 * Every review can be traced back to a booking, and from there to the job it
 * was for and the nurse who worked it:
 *   - booking reviews keep the booking in `object` (and in `bookingId`)
 *   - branch/user reviews carry it in `bookingId` when they were left from a
 *     completed booking
 * These stages attach that context so a review can be rendered on its own,
 * without the caller re-querying bookings and jobs per row.
 */
const reviewContextStages = () => [
  {
    $addFields: {
      contextBookingId: {
        $ifNull: [
          "$bookingId",
          {
            $cond: [{ $eq: ["$objectType", "Booking"] }, "$object", null],
          },
        ],
      },
    },
  },
  {
    $lookup: {
      from: "bookings",
      localField: "contextBookingId",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            job: 1,
            worker: 1,
            branch: 1,
            "snapshot.name": 1,
            "snapshot.image": 1,
          },
        },
      ],
      as: "contextBooking",
    },
  },
  { $unwind: { path: "$contextBooking", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "jobs",
      localField: "contextBooking.job",
      foreignField: "_id",
      pipeline: [{ $project: { name: 1, image: 1 } }],
      as: "contextJob",
    },
  },
  { $unwind: { path: "$contextJob", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "users",
      localField: "contextBooking.worker",
      foreignField: "_id",
      pipeline: [
        { $project: { name: 1, profileIcon: 1, email: 1, accountState: 1 } },
      ],
      as: "contextNurse",
    },
  },
  { $unwind: { path: "$contextNurse", preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      bookingId: "$contextBookingId",
      jobId: "$contextBooking.job",
      // the live job is authoritative; the booking snapshot is the fallback
      jobName: {
        $ifNull: ["$contextJob.name", "$contextBooking.snapshot.name"],
      },
      jobImage: {
        $ifNull: ["$contextJob.image", "$contextBooking.snapshot.image"],
      },
      nurse: "$contextNurse",
    },
  },
  {
    $project: {
      contextBookingId: 0,
      contextBooking: 0,
      contextJob: 0,
      contextNurse: 0,
    },
  },
];

const reviewerProjection = {
  name: 1,
  profileIcon: 1,
  accountState: 1,
  email: 1,
};

// Turns stored image paths into absolute URLs on the context we just attached.
const withContextImages = (review) => ({
  ...review,
  jobImage: review.jobImage ? getFullImageUrl(review.jobImage) : "",
  nurse: review.nurse
    ? {
        ...review.nurse,
        profileIcon: getFullImageUrl(review.nurse.profileIcon ?? ""),
      }
    : null,
});

const buildRatingStats = ({ totalReviews = 0, ratingSum = 0 }) => ({
  totalReviews,
  averageRating:
    totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0,
});

/**
 * Batched replacement for calling getReviews once per row.
 *
 * Returns a Map keyed by the entity id, each holding the newest `limit`
 * reviews plus rating stats and whether `currentUserId` already reviewed it.
 * `onlyOwn` narrows the returned array to the caller's own reviews, which is
 * what a customer sees against their own bookings.
 */
const getReviewsForObjects = async ({
  objectIds = [],
  objectType,
  currentUserId,
  limit = 5,
  onlyOwn = false,
} = {}) => {
  const result = new Map();
  const ids = objectIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) return result;

  const viewerId = mongoose.isValidObjectId(currentUserId)
    ? new mongoose.Types.ObjectId(currentUserId)
    : null;

  const rows = await Review.aggregate([
    { $match: { object: { $in: ids }, ...(objectType ? { objectType } : {}) } },
    ...reviewContextStages(),
    {
      $lookup: {
        from: "users",
        localField: "subject",
        foreignField: "_id",
        pipeline: [{ $project: reviewerProjection }],
        as: "subject",
      },
    },
    { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$object",
        // stats must span every review, not just the ones returned
        totalReviews: { $sum: 1 },
        ratingSum: { $sum: "$rating" },
        hasOwnReview: {
          $max: viewerId ? { $eq: ["$subject._id", viewerId] } : false,
        },
        reviews: {
          $push: {
            $cond: [
              onlyOwn && viewerId ? { $eq: ["$subject._id", viewerId] } : true,
              "$$ROOT",
              "$$REMOVE",
            ],
          },
        },
      },
    },
    {
      $project: {
        totalReviews: 1,
        ratingSum: 1,
        hasOwnReview: 1,
        reviews: limit === 0 ? "$reviews" : { $slice: ["$reviews", limit] },
      },
    },
  ]);

  for (const row of rows) {
    result.set(String(row._id), {
      reviews: (row.reviews || []).map(withContextImages),
      hasReview: Boolean(row.hasOwnReview),
      ratingStats: buildRatingStats(row),
    });
  }

  return result;
};

/**
 * Same as getReviewsForObjects but keyed by the person being reviewed, which is
 * how a nurse's own reviews are collected regardless of review type.
 */
const getReviewsForObjectUsers = async ({
  userIds = [],
  currentUserId,
  limit = 5,
} = {}) => {
  const result = new Map();
  const ids = userIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) return result;

  const viewerId = mongoose.isValidObjectId(currentUserId)
    ? new mongoose.Types.ObjectId(currentUserId)
    : null;

  const rows = await Review.aggregate([
    { $match: { objectUser: { $in: ids } } },
    ...reviewContextStages(),
    {
      $lookup: {
        from: "users",
        localField: "subject",
        foreignField: "_id",
        pipeline: [{ $project: reviewerProjection }],
        as: "subject",
      },
    },
    { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$objectUser",
        totalReviews: { $sum: 1 },
        ratingSum: { $sum: "$rating" },
        hasOwnReview: {
          $max: viewerId ? { $eq: ["$subject._id", viewerId] } : false,
        },
        reviews: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        totalReviews: 1,
        ratingSum: 1,
        hasOwnReview: 1,
        reviews: limit === 0 ? "$reviews" : { $slice: ["$reviews", limit] },
      },
    },
  ]);

  for (const row of rows) {
    result.set(String(row._id), {
      reviews: (row.reviews || []).map(withContextImages),
      hasReview: Boolean(row.hasOwnReview),
      ratingStats: buildRatingStats(row),
    });
  }

  return result;
};

const EMPTY_RATING_STATS = { totalReviews: 0, averageRating: 0 };

/**
 * Everything a user payload needs to show its own reviews: the reviews
 * themselves (with booking/job/nurse context), the aggregate rating, and
 * whether the viewer has already left one.
 *
 * `limit: 0` returns every review, which is what a profile wants.
 */
const getUserReviewSummary = async (
  userId,
  { currentUserId, limit = 0 } = {},
) => {
  if (!mongoose.isValidObjectId(userId)) {
    return { reviews: [], hasReview: false, ratingStats: EMPTY_RATING_STATS };
  }

  const summaries = await getReviewsForObjectUsers({
    userIds: [userId],
    currentUserId,
    limit,
  });

  const summary = summaries.get(String(userId));

  return {
    reviews: summary?.reviews || [],
    hasReview: summary?.hasReview || false,
    ratingStats: summary?.ratingStats || EMPTY_RATING_STATS,
  };
};

/**
 * Attaches that summary onto a plain user object so whatever formats it next
 * (formatUserResponse, or a raw controller response) can pass it straight
 * through. Returns a new object; the input is not mutated.
 */
const withUserReviews = async (userObject, { currentUserId, limit } = {}) => {
  if (!userObject) return userObject;

  const summary = await getUserReviewSummary(userObject._id, {
    currentUserId,
    limit,
  });

  return { ...userObject, ...summary };
};

const createReview = async (data = {}) => {
  const created = await Review.create(data);
  const { reviews } = await getReviews(
    { _id: created._id },
    { skip: 0, limit: 1 },
  );
  return reviews[0] || null;
};

const findReviewByUniqueScope = async ({ subject, object }) => {
  return Review.findOne({ subject, object });
};

const hasReview = async ({ subject, object, objectUser, reviewType }) => {
  if (!subject || (!object && !objectUser)) return false;

  return Boolean(
    await Review.exists({
      subject: new mongoose.Types.ObjectId(subject),
      ...(object ? { object: new mongoose.Types.ObjectId(object) } : {}),
      ...(objectUser
        ? { objectUser: new mongoose.Types.ObjectId(objectUser) }
        : {}),
      ...(reviewType ? { reviewType } : {}),
    }),
  );
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
        pipeline: [
          { $project: { name: 1, profileIcon: 1, accountState: 1, email: 1 } },
        ],
        as: "subject",
      },
    },
    { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },

    // Populate service object
    {
      $lookup: {
        from: "bookings",
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
                  { $eq: ["$$objectType", "Booking"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              "snapshot.name": 1,
            },
          },
        ],
        as: "bookingObject",
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

    // Populate branch object
    {
      $lookup: {
        from: "branches",
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
                  { $eq: ["$$objectType", "Branches"] },
                ],
              },
            },
          },
          { $project: { _id: 1, name: 1, profileIcon: 1 } },
        ],
        as: "branchObject",
      },
    },

    {
      $addFields: {
        object: {
          $ifNull: [
            { $arrayElemAt: ["$bookingObject", 0] },
            {
              $ifNull: [
                { $arrayElemAt: ["$userObject", 0] },
                { $arrayElemAt: ["$branchObject", 0] },
              ],
            },
          ],
        },
      },
    },

    {
      $project: {
        bookingObject: 0,
        userObject: 0,
        branchObject: 0,
      },
    },

    // booking -> job -> nurse context for every review
    ...reviewContextStages(),

    // Populate reviewed user
    {
      $lookup: {
        from: "users",
        localField: "objectUser",
        foreignField: "_id",
        pipeline: [
          { $project: { name: 1, profileIcon: 1, accountState: 1, email: 1 } },
        ],
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

  const formattedReviews = await enrichReviewsWithSelectedFlag(
    reviews.map(withContextImages),
  );
  const [formatedReviewsWithContext] = await Promise.all([
    formatReviews(formattedReviews),
  ]);

  return {
    reviews: formatedReviewsWithContext,
    total,
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
// Every review left about this user, each carrying the booking/job/nurse it
// came from so a profile can render them without extra queries.
const findReviewByUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return [];

  const reviews = await Review.aggregate([
    { $match: { objectUser: new mongoose.Types.ObjectId(userId) } },
    ...reviewContextStages(),
    {
      $lookup: {
        from: "users",
        localField: "subject",
        foreignField: "_id",
        pipeline: [{ $project: reviewerProjection }],
        as: "subject",
      },
    },
    { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
  ]);

  return formatReviews(reviews.map(withContextImages));
};
const findReviewByBranch = async (branchIds = []) => {
  if (!branchIds.length) return [];
  const ids = branchIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await Review.aggregate([
    { $match: { object: { $in: ids }, objectType: "Branches" } },
    {
      $group: {
        _id: "$object",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const statsMap = new Map(
    rows.map((r) => [
      String(r._id),
      {
        averageRating: Number(r.averageRating.toFixed(1)),
        totalReviews: r.totalReviews,
      },
    ]),
  );

  return branchIds.map((id) => ({
    id: String(id),
    averageRating: statsMap.get(String(id))?.averageRating || 0,
    totalReviews: statsMap.get(String(id))?.totalReviews || 0,
  }));
};

const updateReviewById = async (id, data = {}) => {
  const updated = await Review.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!updated) return updated;

  const { reviews } = await getReviews(
    { _id: updated._id },
    { skip: 0, limit: 1 },
  );
  return reviews[0] || null;
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

const findReviewByStaff = async (staffIds = []) => {
  if (!staffIds.length) return [];

  const ids = staffIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await Review.aggregate([
    { $match: { objectUser: { $in: ids } } },
    {
      $group: {
        _id: "$objectUser",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  // map results back so every staff id appears, even with zero reviews
  const statsMap = new Map(
    rows.map((r) => [
      String(r._id),
      {
        averageRating: Number(r.averageRating.toFixed(1)),
        totalReviews: r.totalReviews,
      },
    ]),
  );

  return staffIds.map((id) => ({
    id: String(id),
    averageRating: statsMap.get(String(id))?.averageRating || 0,
    totalReviews: statsMap.get(String(id))?.totalReviews || 0,
  }));
};
module.exports = {
  createReview,
  findReviewByUniqueScope,
  hasReview,
  getReviewsForObjects,
  getReviewsForObjectUsers,
  getUserReviewSummary,
  withUserReviews,
  getReviews,
  getRatingStats,
  findReviewById,
  updateReviewById,
  deleteReviewById,
  getEditedReviewStats,
  findReviewByUser,
  findReviewByStaff,
  findReviewByBranch,
};
