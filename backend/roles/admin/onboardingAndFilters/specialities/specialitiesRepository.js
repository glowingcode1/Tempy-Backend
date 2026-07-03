const Specialties = require("./SpecialitiesModel");
const { cache, invalidate } = require("@redisCache");
const SPECIALTIES_CACHE_KEY = "specialities";

const createSpecialty = async ({ title, status }) => {
  const specialty = new Specialties({
    title: title || "",
    status,
  });
  const saved = await specialty.save();
  await invalidate(SPECIALTIES_CACHE_KEY);
  return saved;
};

const getSpecialities = async (filter = {}) => {
  return cache({
    namespace: SPECIALTIES_CACHE_KEY,
    params: filter,
    fetchFn: () => Specialties.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findSpecialtyById = async (id) => {
  return cache({
    namespace: SPECIALTIES_CACHE_KEY,
    params: { id },
    fetchFn: () => Specialties.findById(id)
  });
};

const updateSpecialtyById = async (id, data) => {
  const updated = await Specialties.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(SPECIALTIES_CACHE_KEY);
  return updated;
};

const deleteSpecialtyById = async (id) => {
  const deleted = await Specialties.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(SPECIALTIES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createSpecialty,
  getSpecialities,
  findSpecialtyById,
  updateSpecialtyById,
  deleteSpecialtyById,
};
