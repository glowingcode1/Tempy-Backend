const ExperienceLevels = require("./ExperienceLevelModel");
const { cache, invalidate } = require("@redisCache");
const Experience_Levels_CACHE_KEY = "experienceLevels";

const createExperienceLevel = async ({ title, status }) => {
  const experienceLevel = new ExperienceLevels({
    title: title || "",
    status,
  });
  const saved = await experienceLevel.save();
  await invalidate(Experience_Levels_CACHE_KEY);
  return saved;
};

const getExperienceLevels = async (filter = {}) => {
  return cache({
    namespace: Experience_Levels_CACHE_KEY,
    params: filter,
    fetchFn: () => ExperienceLevels.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findExperienceLevelById = async (id) => {
  return cache({
    namespace: Experience_Levels_CACHE_KEY,
    params: { id },
    fetchFn: () => ExperienceLevels.findById(id)
  });
};

const updateExperienceLevelById = async (id, data) => {
  const updated = await ExperienceLevels.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(Experience_Levels_CACHE_KEY);
  return updated;
};

const deleteExperienceLevelById = async (id) => {
  const deleted = await ExperienceLevels.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(Experience_Levels_CACHE_KEY);
  return deleted;
};

module.exports = {
  createExperienceLevel,
  getExperienceLevels,
  findExperienceLevelById,
  updateExperienceLevelById,
  deleteExperienceLevelById,
};
