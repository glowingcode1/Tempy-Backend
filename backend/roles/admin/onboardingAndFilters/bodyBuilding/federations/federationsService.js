const federationsRepo = require("./federationsRepository");

const getFederations = async (filter = {}) => {
  const federations = await federationsRepo.getFederations(filter);
  return {
    federations,
  };
};

const getFederationById = async (id) => {
  return federationsRepo.findFederationById(id);
};

const createFederation = async ({ title, status }) => {
  return federationsRepo.createFederation({
    title,
    status,
  });
};

const updateFederation = async (id, { title, status }) => {
  return federationsRepo.updateFederationById(id, { title, status });
};

const deleteFederation = async (id) => {
  return federationsRepo.deleteFederationById(id);
};

module.exports = {
  getFederations,
  getFederationById,
  createFederation,
  updateFederation,
  deleteFederation,
};
