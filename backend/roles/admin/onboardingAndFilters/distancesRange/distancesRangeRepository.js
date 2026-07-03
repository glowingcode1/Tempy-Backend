const DistanceRanges = require("./DistancesRangeModel");
const { cache, invalidate } = require("@redisCache");
const DISTANCE_RANGES_CACHE_KEY = "distanceRanges";

const createDistanceRange = async ({ title, status }) => {
  const distanceRange = new DistanceRanges({
    title: title || "",
    status,
  });
  const saved = await distanceRange.save();
  await invalidate(DISTANCE_RANGES_CACHE_KEY);
  return saved;
};

const getDistanceRanges = async (filter = {}) => {
  return cache({
    namespace: DISTANCE_RANGES_CACHE_KEY,
    params: filter,
    fetchFn: () => DistanceRanges.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findDistanceRangeById = async (id) => {
  return cache({
    namespace: DISTANCE_RANGES_CACHE_KEY,
    params: { id },
    fetchFn: () => DistanceRanges.findById(id)
  });
};

const updateDistanceRangeById = async (id, data) => {
  const updated = await DistanceRanges.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(DISTANCE_RANGES_CACHE_KEY);
  return updated;
};

const deleteDistanceRangeById = async (id) => {
  const deleted = await DistanceRanges.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(DISTANCE_RANGES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createDistanceRange,
  getDistanceRanges,
  findDistanceRangeById,
  updateDistanceRangeById,
  deleteDistanceRangeById,
};
