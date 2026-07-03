const usersOnboardingResponsesService = require("./coachOnboardingResponsesService");
const {
    sendResponse,
    getReadableErrorMessage,
    validateParams,
} = require("@helperUtils/responseUtil");

const getUsersOnboardingResponses = async (req, res) => {
    try {
        const { responses } = await usersOnboardingResponsesService.getUsersOnboardingResponses(req.query || {});
        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "users_onboarding_responses_found",
            data: responses,
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

const getUsersOnboardingResponseById = async (req, res) => {
    const { id } = req.params;
    const { name } = req.user || {};
    try {
        let response = await usersOnboardingResponsesService.getUsersOnboardingResponseById(id);
        if (!response) {
            return sendResponse({
                res,
                statusCode: 404,
                translationKey: "users_onboarding_response_not_found",
            });
        }
        response.name = name; // Include user name in the response

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "users_onboarding_response_found",
            data: response,
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

// Upsert route: create or update by user
const upsertUsersOnboardingResponse = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: "empty_request_body",
            });
        }
        let { _id: userId } = req.user || {};
        req.body.user = userId;
        // Upsert by user
        const saved = await usersOnboardingResponsesService.upsertUsersOnboardingResponseByUser(userId, req.body);
        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "users_onboarding_response_saved",
            data: saved,
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

const deleteUsersOnboardingResponse = async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await usersOnboardingResponsesService.deleteUsersOnboardingResponse(id);
        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "users_onboarding_response_deleted",
            data: deleted,
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
    getUsersOnboardingResponses,
    getUsersOnboardingResponseById,
    upsertUsersOnboardingResponse,
    deleteUsersOnboardingResponse,
};
