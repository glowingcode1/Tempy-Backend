const placeholderProfileRepo = require("./placeholderProfileRepository");
const { generate } = require("shortid");
const { generateMeta } = require("@helperUtils/responseUtil");

const getPlaceholderProfile = async (
  filter = {},
  skip,
  limit,
  page,
) => {
  const { placeholderProfile, total } =
    await placeholderProfileRepo.getPlaceholderProfile(
      filter,
      skip,
      limit,
    );
  const meta = generateMeta(page, limit, total);
  return {
    placeholderProfile,
    meta,
  };
};

const getPlaceholderProfileById = async (id, userId) => {
  const PlaceholderProfile =
    await placeholderProfileRepo.findPlaceholderProfileById(id, userId);
  return PlaceholderProfile;
};

const createPlaceholderProfile = async (data, timezone) => {
  const filter = {
    instagramHandle: data.instagramHandle,
    status: { $ne: "deleted" },
  };

  const userData = {
    user: data.user,
    name: data.name,
    email: data.email || "",
    phoneNumber: data.phoneNumber || {},
    images: data.image || "",
    notification: !!data.notification,
  };

  let existing = await placeholderProfileRepo.getPlaceholderProfile(filter);
  existing = existing?.placeholderProfile || [];

  if (existing.length <= 0) {
    const payload = {
      instagramHandle: data.instagramHandle,
      users: [userData],
    };

    return await placeholderProfileRepo.createPlaceholderProfile(payload);
  }

  const profile = existing[0];

  const alreadyAdded = profile.users.some(
    (item) => item.user.toString() === data.user.toString(),
  );

  if (alreadyAdded) {
    return {
      error: "user_already_added_this_instagram_handle",
    };
  }

  profile.users.push(userData);

  return await placeholderProfileRepo.addPlaceholderProfileById(profile._id, {
    users: profile.users,
  });
};

const updatePlaceholderProfile = async (id, data, userId, timezone) => {
  const PlaceholderProfile =
    await placeholderProfileRepo.updatePlaceholderProfileById(id, data, userId);
  return PlaceholderProfile;
};

const deletePlaceholderProfile = async (id, userId, timezone) => {
  const PlaceholderProfile =
    await placeholderProfileRepo.deletePlaceholderProfileById(id, userId);
  return PlaceholderProfile;
};
const getPlaceholderProfileCalender = async (filter = {}, timezone) => {
  const PlaceholderProfile =
    await placeholderProfileRepo.getPlaceholderProfileCalender(filter);
  return PlaceholderProfile;
};
module.exports = {
  getPlaceholderProfile,
  getPlaceholderProfileById,
  createPlaceholderProfile,
  updatePlaceholderProfile,
  deletePlaceholderProfile,
  getPlaceholderProfileCalender,
};
