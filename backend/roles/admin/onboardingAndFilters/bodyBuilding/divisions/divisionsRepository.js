const Divisions = require("./DivisionsModel");
const { cache, invalidate } = require("@redisCache");
const BODY_BUILDING_DIVISIONS_CACHE_KEY = "bodyBuildingDivisions";

const createDivision = async ({ title, status }) => {
  const division = new Divisions({
    title: title || "",
    status,
  });
  const saved = await division.save();
  await invalidate(BODY_BUILDING_DIVISIONS_CACHE_KEY);
  return saved;
};

const getDivisions = async (filter = {}) => {
  return cache({
    namespace: BODY_BUILDING_DIVISIONS_CACHE_KEY,
    params: filter,
    fetchFn: () => Divisions.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findDivisionById = async (id) => {
  return cache({
    namespace: BODY_BUILDING_DIVISIONS_CACHE_KEY,
    params: { id },
    fetchFn: () => Divisions.findById(id)
  });
};

const updateDivisionById = async (id, data) => {
  const updated = await Divisions.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(BODY_BUILDING_DIVISIONS_CACHE_KEY);
  return updated;
};

const deleteDivisionById = async (id) => {
  const deleted = await Divisions.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(BODY_BUILDING_DIVISIONS_CACHE_KEY);
  return deleted;
};

module.exports = {
  createDivision,
  getDivisions,
  findDivisionById,
  updateDivisionById,
  deleteDivisionById,
};
