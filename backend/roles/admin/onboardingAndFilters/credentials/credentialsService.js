const credentialsRepo = require("./credentialsRepository");

const getCredentials = async (filter = {}) => {
  const credentials = await credentialsRepo.getCredentials(filter);
  return {
    credentials,
  };
};

const getCredentialById = async (id) => {
  return credentialsRepo.findCredentialById(id);
};

const createCredential = async ({ title, description, status }) => {
  return credentialsRepo.createCredential({
    title,
    description,
    status,
  });
};

const updateCredential = async (id, data) => {
  return credentialsRepo.updateCredentialById(id, data);
};

const deleteCredential = async (id) => {
  return credentialsRepo.deleteCredentialById(id);
};

module.exports = {
  getCredentials,
  getCredentialById,
  createCredential,
  updateCredential,
  deleteCredential,
};
