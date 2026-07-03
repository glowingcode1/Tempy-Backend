const Federations = require("./FederationsModel");
const { cache, invalidate } = require("@redisCache");
const BODY_BUILDING_FEDERATIONS_CACHE_KEY = "bodyBuildingFederations";

const createFederation = async ({ title, status }) => {
  const federation = new Federations({
    title: title || "",
    status,
  });
  const saved = await federation.save();
  await invalidate(BODY_BUILDING_FEDERATIONS_CACHE_KEY);
  return saved;
};

const getFederations = async (filter = {}) => {
  return cache({
    namespace: BODY_BUILDING_FEDERATIONS_CACHE_KEY,
    params: filter,
    fetchFn: () => Federations.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findFederationById = async (id) => {
  return cache({
    namespace: BODY_BUILDING_FEDERATIONS_CACHE_KEY,
    params: { id },
    fetchFn: () => Federations.findById(id)
  });
};

const updateFederationById = async (id, data) => {
  const updated = await Federations.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(BODY_BUILDING_FEDERATIONS_CACHE_KEY);
  return updated;
};

const deleteFederationById = async (id) => {
  const deleted = await Federations.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(BODY_BUILDING_FEDERATIONS_CACHE_KEY);
  return deleted;
};

module.exports = {
  createFederation,
  getFederations,
  findFederationById,
  updateFederationById,
  deleteFederationById,
};
