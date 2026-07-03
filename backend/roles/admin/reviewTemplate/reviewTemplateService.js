const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const reviewTemplateRepo = require("./freviewTemplateRepository");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";
const CACHE_KEY = "adminSettings:active:ReviewTemplate";
const invalidateReviewTemplateCache = async () => {
  await invalidate(CACHE_KEY);
};
const createReviewTemplate = async (data) => {
  let reviewTemplate = await reviewTemplateRepo.createReviewTemplate(data);
  return reviewTemplate;
};
const getReviewTemplates = async ({ userId }) => {
  const reviewTemplate = await reviewTemplateRepo.getReviewTemplates({
    userId,
  });

  return reviewTemplate;
};

const updateReviewTemplate = async (id, data) => {

  const reviewTemplate = await reviewTemplateRepo.findReviewTemplateById(id);
  if (!reviewTemplate) {
    return { error: "ReviewTemplate_not_found" };
  }
  const allowedFields = ["question", "type", "options", "order", "status", "createdBy","category", "userType"];

  // -----------------------------
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }
  await invalidateReviewTemplateCache();

  if (Object.keys(updateData).length === 0) {
    return reviewTemplate;
  }

  Object.assign(reviewTemplate, updateData);
  await reviewTemplate.save();

  return reviewTemplate;
};

const deleteReviewTemplate = async (id) => {
  if (!id) throw new Error("ReviewTemplate ID is required");

  const deleted = await reviewTemplateRepo.deleteReviewTemplate(id);
  return !!deleted;
};

module.exports = {
  createReviewTemplate,
  getReviewTemplates,
  updateReviewTemplate,
  deleteReviewTemplate,
};
