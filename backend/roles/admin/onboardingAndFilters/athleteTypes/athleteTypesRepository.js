const AthleteTypes = require("./AthleteTypesModel");
const { cache, invalidate } = require("@redisCache");
const ATHLETE_TYPES_CACHE_KEY = "athleteTypes";

const createAthleteType = async ({ title, description, status }) => {
  const clientType = new AthleteTypes({
    title: title || "",
    description: description || "",
    status,
  });
  const saved = await clientType.save();
  await invalidate(ATHLETE_TYPES_CACHE_KEY);
  return saved;
};

const getAthleteTypes = async (filter = {}) => {
  return cache({
    namespace: ATHLETE_TYPES_CACHE_KEY,
    params: filter,
    fetchFn: () => AthleteTypes.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findAthleteTypeById = async (id) => {
  return cache({
    namespace: ATHLETE_TYPES_CACHE_KEY,
    params: { id },
    fetchFn: () => AthleteTypes.findById(id)
  });
};

const updateAthleteTypeById = async (id, data) => {
  const updated = await AthleteTypes.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(ATHLETE_TYPES_CACHE_KEY);
  return updated;
};

const deleteAthleteTypeById = async (id) => {
  const deleted = await AthleteTypes.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(ATHLETE_TYPES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createAthleteType,
  getAthleteTypes,
  findAthleteTypeById,
  updateAthleteTypeById,
  deleteAthleteTypeById,
};
