const experienceLevelRepo = require("./experienceLevelRepository");

const getExperienceLevels = async (filter = {}) => {
  const experienceLevels = await experienceLevelRepo.getExperienceLevels(filter);
  return {
    experienceLevels,
  };
};

const getExperienceLevelById = async (id) => {
  return experienceLevelRepo.findExperienceLevelById(id);
};

const createExperienceLevel = async ({ title, description, status }) => {
  return experienceLevelRepo.createExperienceLevel({
    title,
    description,
    status,
  });
};

const updateExperienceLevel = async (id, data) => {
  return experienceLevelRepo.updateExperienceLevelById(id, data);
};

const deleteExperienceLevel = async (id) => {
  return experienceLevelRepo.deleteExperienceLevelById(id);
};

module.exports = {
  getExperienceLevels,
  getExperienceLevelById,
  createExperienceLevel,
  updateExperienceLevel,
  deleteExperienceLevel,
};
