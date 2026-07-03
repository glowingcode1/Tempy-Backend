const credentialsService = require("./credentialsService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getCredentials = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { credentials } = await credentialsService.getCredentials(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "credentials_found",
      data: credentials,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const getCredentialById = async (req, res) => {
  const { id } = req.params;

  try {
    const credential = await credentialsService.getCredentialById(id);
    if (!credential || credential.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "credential_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "credential_found",
      data: credential,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const createCredential = async (req, res) => {
  const { title, description, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedCredential = await credentialsService.createCredential({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "credential_created",
      data: savedCredential,
    });
  } catch (error) {
    const duplicateError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error,
    });
  }
};

const updateCredential = async (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;

  try {
    const updatedCredential = await credentialsService.updateCredential(id, {
      title,
      description,
      status,
    });

    if (!updatedCredential) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "credential_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "credential_updated",
      data: updatedCredential,
    });
  } catch (error) {
    const duplicateError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error,
    });
  }
};

const deleteCredential = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedCredential = await credentialsService.deleteCredential(id);
    if (!deletedCredential) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "credential_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "credential_deleted",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getCredentials,
  getCredentialById,
  createCredential,
  updateCredential,
  deleteCredential,
};
