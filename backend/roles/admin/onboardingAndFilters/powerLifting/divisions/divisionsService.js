const divisionsRepo = require("./divisionsRepository");

const getDivisions = async (filter = {}) => {
  const divisions = await divisionsRepo.getDivisions(filter);
  return {
    divisions,
  };
};

const getDivisionById = async (id) => {
  return divisionsRepo.findDivisionById(id);
};

const createDivision = async ({ title, status }) => {
  return divisionsRepo.createDivision({
    title,
    status,
  });
};

const updateDivision = async (id, { title, status }) => {
  return divisionsRepo.updateDivisionById(id, { title, status });
};

const deleteDivision = async (id) => {
  return divisionsRepo.deleteDivisionById(id);
};

module.exports = {
  getDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision,
};
