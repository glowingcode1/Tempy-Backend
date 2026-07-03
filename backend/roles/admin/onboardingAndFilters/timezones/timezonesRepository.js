const Timezones = require("./TimezonesModel");
const { cache, invalidate } = require("@redisCache");
const TIMEZONES_CACHE_KEY = "timezones";

const createTimezone = async ({ title, status }) => {
  const timezone = new Timezones({
    title: title || "",
    status,
  });
  const saved = await timezone.save();
  await invalidate(TIMEZONES_CACHE_KEY);
  return saved;
};

const getTimezones = async (filter = {}) => {
  return cache({
    namespace: TIMEZONES_CACHE_KEY,
    params: filter,
    fetchFn: () => Timezones.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findTimezoneById = async (id) => {
  return cache({
    namespace: TIMEZONES_CACHE_KEY,
    params: { id },
    fetchFn: () => Timezones.findById(id)
  });
};

const updateTimezoneById = async (id, data) => {
  const updated = await Timezones.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(TIMEZONES_CACHE_KEY);
  return updated;
};

const deleteTimezoneById = async (id) => {
  const deleted = await Timezones.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(TIMEZONES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createTimezone,
  getTimezones,
  findTimezoneById,
  updateTimezoneById,
  deleteTimezoneById,
};
