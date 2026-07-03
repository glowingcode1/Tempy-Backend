const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");

const { generateMeta } = require("@helperUtils/responseUtil");
const { cache, invalidate } = require("@redisCache");

const ReviewTemplate = require("./ReviewTemplate");

const CACHE_KEY_REVIEW_TEMPLATE = "adminSettings:active:ReviewTemplate";

const buildReviewTemplateCacheKey = ({ userId }) => {
  return `${CACHE_KEY_REVIEW_TEMPLATE}:userId=${userId || "guest"}`;
};

const invalidateReviewTemplateCache = async () => {
  await invalidate(CACHE_KEY_REVIEW_TEMPLATE);
};

const createReviewTemplate = async (data) => {
  try {
    const reviewTemplate = new ReviewTemplate(data);

    await reviewTemplate.save();

    await invalidateReviewTemplateCache();

    return reviewTemplate;
  } catch (err) {
    throw err;
  }
};

const getReviewTemplates = async ({ userId }) => {
  const cacheKey = buildReviewTemplateCacheKey({
    userId,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,

    fetchFn: async () => {
      const pipeline = [
        {
          $match: {
            status: "active",
          },
        },
        { $sort: { order: 1 } },
      ];

      const result = await ReviewTemplate.aggregate(pipeline);

      let reviewTemplate = result || null;

      if (reviewTemplate) {
        reviewTemplate.questions = (reviewTemplate.questions || []).sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        );
      }
      return reviewTemplate;
    },
  });
};

const findReviewTemplateById = async (id) => {
  return ReviewTemplate.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  const updated = await ReviewTemplate.findByIdAndUpdate(id, data, {
    new: true,
  });

  await invalidateReviewTemplateCache();

  return updated;
};

const deleteReviewTemplate = async (id) => {

  const deleted = await ReviewTemplate.findByIdAndDelete(id);

  await invalidateReviewTemplateCache();

  return deleted;
};

module.exports = {
  createReviewTemplate,
  getReviewTemplates,
  findReviewTemplateById,
  findByIdAndUpdate,
  deleteReviewTemplate,
  CACHE_KEY_REVIEW_TEMPLATE
};
