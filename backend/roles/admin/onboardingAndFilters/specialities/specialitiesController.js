const specialtiesService = require("./specialitiesService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getSpecialities = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { specialities } = await specialtiesService.getSpecialities(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "specialties_found",
      data: specialities,
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

const getSpecialtyById = async (req, res) => {
  const { id } = req.params;

  try {
    const specialty = await specialtiesService.getSpecialtyById(id);
    if (!specialty || specialty.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "specialty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "specialty_found",
      data: specialty,
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

const createSpecialty = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedSpecialty = await specialtiesService.createSpecialty({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "specialty_created",
      data: savedSpecialty,
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

const updateSpecialty = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedSpecialty = await specialtiesService.updateSpecialty(id, {
      title,
      status,
    });

    if (!updatedSpecialty) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "specialty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "specialty_updated",
      data: updatedSpecialty,
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

const deleteSpecialty = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedSpecialty = await specialtiesService.deleteSpecialty(id);
    if (!deletedSpecialty) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "specialty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "specialty_deleted",
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
  getSpecialities,
  getSpecialtyById,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
};
