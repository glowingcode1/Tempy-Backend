const specialtiesRepo = require("./specialitiesRepository");

const getSpecialities = async (filter = {}) => {
  const specialities = await specialtiesRepo.getSpecialities(filter);
  return {
    specialities,
  };
};

const getSpecialtyById = async (id) => {
  return specialtiesRepo.findSpecialtyById(id);
};

const createSpecialty = async ({ title, status }) => {
  return specialtiesRepo.createSpecialty({
    title,
    status,
  });
};

const updateSpecialty = async (id, { title, status }) => {
  return specialtiesRepo.updateSpecialtyById(id, { title, status });
};

const deleteSpecialty = async (id) => {
  return specialtiesRepo.deleteSpecialtyById(id);
};

module.exports = {
  getSpecialities,
  getSpecialtyById,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
};
