const Credentials = require("./CredentialsModel");
const { cache, invalidate } = require("@redisCache");
const CREDENTIALS_CACHE_KEY = "credentials";
const createCredential = async ({ title, description, status }) => {
  const credential = new Credentials({
    title: title || "",
    description: description || "",
    status,
  });
  const saved = await credential.save();
  await invalidate(CREDENTIALS_CACHE_KEY);
  return saved;
};

const getCredentials = async (filter = {}) => {
  return cache({
    namespace: CREDENTIALS_CACHE_KEY,
    params: filter,
    fetchFn: () => Credentials.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findCredentialById = async (id) => {
  return cache({
    namespace: CREDENTIALS_CACHE_KEY,
    params: { id },
    fetchFn: () => Credentials.findById(id)
  });
};

const updateCredentialById = async (id, data) => {
  const updated = await Credentials.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(CREDENTIALS_CACHE_KEY);
  return updated;
};

const deleteCredentialById = async (id) => {
  const deleted = await Credentials.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(CREDENTIALS_CACHE_KEY);
  return deleted;
};

module.exports = {
  createCredential,
  getCredentials,
  findCredentialById,
  updateCredentialById,
  deleteCredentialById,
};
