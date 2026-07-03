const CoachingStyle = require("./CoachingStyleModel");
const { cache, invalidate } = require("@redisCache");
const COACHING_STYLES_CACHE_KEY = "coachingStyles";

const createCoachingStyle = async ({ title, status }) => {
  const coachingStyle = new CoachingStyle({
    title: title || "",
    status,
  });
  const saved = await coachingStyle.save();
  await invalidate(COACHING_STYLES_CACHE_KEY);
  return saved;
};

const getCoachingStyles = async (filter = {}) => {
  return cache({
    namespace: COACHING_STYLES_CACHE_KEY,
    params: filter,
    fetchFn: () => CoachingStyle.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findCoachingStyleById = async (id) => {
  return cache({
    namespace: COACHING_STYLES_CACHE_KEY,
    params: { id },
    fetchFn: () => CoachingStyle.findById(id)
  });
};

const updateCoachingStyleById = async (id, data) => {
  const updated = await CoachingStyle.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(COACHING_STYLES_CACHE_KEY);
  return updated;
};

const deleteCoachingStyleById = async (id) => {
  const deleted = await CoachingStyle.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(COACHING_STYLES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createCoachingStyle,
  getCoachingStyles,
  findCoachingStyleById,
  updateCoachingStyleById,
  deleteCoachingStyleById,
};
