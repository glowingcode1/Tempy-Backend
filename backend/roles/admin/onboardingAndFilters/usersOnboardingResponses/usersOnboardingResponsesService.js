const usersOnboardingResponsesRepo = require("./usersOnboardingResponsesRepository");
const {
  formatOnboardingResponses,
  formatOnboardingResponse,
} = require("./formatter/formatOnboardingResponses");
const { User } = require("@UsersModel");

const getUsersOnboardingResponses = async (filter = {}) => {
  const responses = await usersOnboardingResponsesRepo.getUsersOnboardingResponses(filter);
  return {
    responses: formatOnboardingResponses(responses),
  };
};

const getUsersOnboardingResponseById = async (id) => {
  const response = await usersOnboardingResponsesRepo.findUsersOnboardingResponseById(id);
  return formatOnboardingResponse(response);
};


// Upsert by user: if exists, update; else, create
const upsertUsersOnboardingResponseByUser = async (userId, data) => {
  let existing = await usersOnboardingResponsesRepo.findUsersOnboardingResponseByUser(userId);
  if (data.name) {
    //update user name in users collection if name is provided in onboarding response
    await User.findByIdAndUpdate(userId, { name: data.name });
  }
  if (existing) {
    data.isOnboardingCompleted = true; // Mark onboarding as completed when updating existing response
    let updatedResponse = await usersOnboardingResponsesRepo.updateUsersOnboardingResponseByUser(userId, data);
    return formatOnboardingResponse(updatedResponse);
  } else {
    data.isOnboardingCompleted = true; // Mark onboarding as completed when creating new response
    let newResponse = await usersOnboardingResponsesRepo.createUsersOnboardingResponse(data);
    return formatOnboardingResponse(newResponse);
  }
};

const deleteUsersOnboardingResponse = async (id) => {
  return usersOnboardingResponsesRepo.deleteUsersOnboardingResponseById(id);
};

module.exports = {
  getUsersOnboardingResponses,
  getUsersOnboardingResponseById,
  upsertUsersOnboardingResponseByUser,
  deleteUsersOnboardingResponse,
};
