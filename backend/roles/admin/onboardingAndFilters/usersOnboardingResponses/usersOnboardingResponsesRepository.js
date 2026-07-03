const { User } = require("@UsersModel");
const UsersOnboardingResponsesModel = require("./UsersOnboardingResponsesModel");

const { cache, invalidate } = require("@redisCache");
const CoachOnboardingResponses = require("../coachOnboardingResponses/CoachOnboardingResponsesModel");
const USERS_ONBOARDING_RESPONSES_CACHE_KEY = "usersOnboardingResponses";
const USERS_ONBOARDING_RESPONSES_USER_CACHE_KEY = `${USERS_ONBOARDING_RESPONSES_CACHE_KEY}:user`;

const getUserCachePrefix = (userId) =>
  `${USERS_ONBOARDING_RESPONSES_USER_CACHE_KEY}:userId=${userId}`;

// Find by user
const findUsersOnboardingResponseByUser = async (userId) => {
  return cache({
    namespace: USERS_ONBOARDING_RESPONSES_USER_CACHE_KEY,
    params: { userId },
    fetchFn: () =>
      UsersOnboardingResponsesModel.findOne({ user: userId })
        .populate("user", "name")
        .populate("credentials")
        .populate("specialities")
        .populate("athleteTypes")
        .populate("coachingStyle")
        .populate("coachingModality")
        .populate("experienceLevels")
        .populate("bodyBuilding.federations")
        .populate("bodyBuilding.divisions")
        .populate("powerLifting.federations")
        .populate("powerLifting.divisions"),
  });
};
const findCoachOnboardingResponseByUser = async (userId) => {
  return cache({
    namespace: USERS_ONBOARDING_RESPONSES_USER_CACHE_KEY,
    params: { userId },
    fetchFn: () =>
      CoachOnboardingResponses.findOne({ user: userId })
        .populate("user", "name")
        .populate("credentials")
        .populate("specialities")
        .populate("athleteTypes")
        .populate("coachingStyle")
        .populate("coachingModality")
        .populate("experienceLevels")
        .populate("bodyBuilding.federations")
        .populate("bodyBuilding.divisions")
        .populate("powerLifting.federations")
        .populate("powerLifting.divisions"),
  });
};


// Update by user
const updateUsersOnboardingResponseByUser = async (userId, data) => {
  const doc = await UsersOnboardingResponsesModel.findOne({ user: userId });
  if (!doc) return null;

  const merge = (target, source) => {
    for (const key in source) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        !(sourceVal instanceof Date)
      ) {
        target[key] = merge(targetVal || {}, sourceVal);
      } else {
        target[key] = sourceVal;
      }
    }
    return target;
  };

  merge(doc, data);
  await doc.save();

  // Update user name first (if provided)
  if (data.name) {
    await User.findByIdAndUpdate(userId, { name: data.name }).exec();
  }

  await invalidate(getUserCachePrefix(userId));
  await invalidate(USERS_ONBOARDING_RESPONSES_CACHE_KEY);

  // Re-fetch with all populates so user.name is included naturally
  let onboardingData = await UsersOnboardingResponsesModel.findOne({ user: userId })
    .populate("credentials")
    .populate("specialities")
    .populate("athleteTypes")
    .populate("coachingStyle")
    .populate("coachingModality")
    .populate("experienceLevels")
    .populate("bodyBuilding.federations")
    .populate("bodyBuilding.divisions")
    .populate("powerLifting.federations")
    .populate("powerLifting.divisions");

  onboardingData = onboardingData.toObject();
  onboardingData.name = data.name || onboardingData.name; // Ensure name is included at top-level
  return onboardingData;
};

const createUsersOnboardingResponse = async (data) => {
  const { user: userId } = data;
  const response = new UsersOnboardingResponsesModel(data);
  if (data.name) {
    User.findByIdAndUpdate(userId, { name: data.name }).exec(); // Update user name if provided
  }
  const saved = await response.save();
  if (saved?.user) {
    await invalidate(getUserCachePrefix(saved.user.toString()));
  }
  await invalidate(USERS_ONBOARDING_RESPONSES_CACHE_KEY);
  return saved;
};

const getUsersOnboardingResponses = async (filter = {}) => {
  return cache({
    namespace: USERS_ONBOARDING_RESPONSES_CACHE_KEY,
    params: filter,
    fetchFn: () =>
      UsersOnboardingResponsesModel.find(filter)
        .populate("user", "name").exec(),
  });
};

const findUsersOnboardingResponseById = async (id) => {
  return cache({
    namespace: USERS_ONBOARDING_RESPONSES_USER_CACHE_KEY,
    params: { userId: id },
    fetchFn: () =>
      UsersOnboardingResponsesModel.findOne({ user: id })
        .populate("user", "name")
        .populate("credentials")
        .populate("specialities")
        .populate("athleteTypes")
        .populate("coachingStyle")
        .populate("coachingModality")
        .populate("bodyBuilding.federations")
        .populate("bodyBuilding.divisions")
        .populate("powerLifting.federations")
        .populate("powerLifting.divisions"),
  });
};

const updateUsersOnboardingResponseById = async (id, data) => {
  const doc = await UsersOnboardingResponsesModel.findById(id);
  if (!doc) return null;

  const merge = (target, source) => {
    for (const key in source) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        !(sourceVal instanceof Date)
      ) {
        target[key] = merge(targetVal || {}, sourceVal);
      } else {
        target[key] = sourceVal;
      }
    }
    return target;
  };

  merge(doc, data);
  await doc.save();

  if (data.name) {
    await User.findByIdAndUpdate(doc.user, { name: data.name }).exec();
  }

  if (doc?.user) {
    await invalidate(getUserCachePrefix(doc.user.toString()));
  }
  await invalidate(USERS_ONBOARDING_RESPONSES_CACHE_KEY);

  // Re-fetch with all populates
  return UsersOnboardingResponsesModel.findOne({ user: doc.user })
    .populate("user").select("name")
    .populate("credentials")
    .populate("specialities")
    .populate("athleteTypes")
    .populate("coachingStyle")
    .populate("coachingModality")
    .populate("bodyBuilding.federations")
    .populate("bodyBuilding.divisions")
    .populate("powerLifting.federations")
    .populate("powerLifting.divisions");
};

const deleteUsersOnboardingResponseById = async (id) => {
  const deleted = await UsersOnboardingResponsesModel.findByIdAndUpdate(
    id,
    { deleted: true },
    {
      new: true,
      runValidators: true,
    },
  );
  if (deleted?.user) {
    await invalidate(getUserCachePrefix(deleted.user.toString()));
  }
  await invalidate(USERS_ONBOARDING_RESPONSES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createUsersOnboardingResponse,
  getUsersOnboardingResponses,
  findUsersOnboardingResponseById,
  findUsersOnboardingResponseByUser,
  updateUsersOnboardingResponseByUser,
  updateUsersOnboardingResponseById,
  deleteUsersOnboardingResponseById,
  findCoachOnboardingResponseByUser,
};
