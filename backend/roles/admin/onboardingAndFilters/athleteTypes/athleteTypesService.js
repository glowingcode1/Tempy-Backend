const athleteTypesRepo = require("./athleteTypesRepository");

const getAthleteTypes = async (filter = {}) => {
  const athleteTypes = await athleteTypesRepo.getAthleteTypes(filter);
  return {
    athleteTypes,
  };
};

const getAthleteTypeById = async (id) => {
  return athleteTypesRepo.findAthleteTypeById(id);
};

const createAthleteType = async ({ title, description, status }) => {
  return athleteTypesRepo.createAthleteType({
    title,
    description,
    status,
  });
};

const updateAthleteType = async (id, data) => {
  return athleteTypesRepo.updateAthleteTypeById(id, data);
};

const deleteAthleteType = async (id) => {
  return athleteTypesRepo.deleteAthleteTypeById(id);
};

module.exports = {
  getAthleteTypes,
  getAthleteTypeById,
  createAthleteType,
  updateAthleteType,
  deleteAthleteType,
};
