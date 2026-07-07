const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const favoriteRepo = require("./favoriteRepository");
const { cache, invalidate } = require("@redisCache");
const { registerUserUtility } = require("../../controllers/authUtil");
const formate = require("./formator/formate");
const {
  getUserDetailsForQRRepo,
} = require("../../roles/admin/usersManagement/usersRepository");

const createFavorite = async (data, req, res) => {
  const existing = await favoriteRepo.findFavoriteByFavoriteUserId(
    data.favoriteUser,
  );

  if (existing && existing.status === "deleted") {
    const favorite = await updateFavorite(existing._id, { status: "active" });
    return favorite;
  }
  if(existing && existing.status === "active"){
    return await updateFavorite(existing._id, { status: "deleted" });
  }
  const favoriteRecord = await favoriteRepo.createFavorite(data);
  return favoriteRecord;
};

const getFavorite = async ({
  timezone,
  page,
  limit,
  keyword,
  favoriteUser,
  user,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { favorite, meta } = await favoriteRepo.getFavorite({
    timezone,
    page,
    limit,
    keyword,
    favoriteUser,
    user,
    skip,
  });
  const formatedFavorite = favorite.map((job) => {
    return formate(job, timezone);
  });

  return { favorite: formatedFavorite, meta };
};

const updateFavorite = async (id, data) => {
  const favorite = await favoriteRepo.findFavoriteById(id);

  if (!favorite) {
    return { error: "Favorite_not_found" };
  }

  const allowedFields = [
    "status",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return favorite;
  }

  Object.assign(favorite, updateData);
  await favorite.save();

  return favorite;
};

const getFavoriteDetails = async (id, timezone) => {
  const favorite = await favoriteRepo.findFavoriteById(id);

  if (!favorite) {
    return null;
  }

  return formatFavoriteToTimezone(favorite, timezone);
};
const deleteFavorite = async (id) => {
  if (!id) throw new Error("Favorite ID is required");
  const deleted = await favoriteRepo.deleteFavorite(id);
  return !!deleted;
};

module.exports = {
  createFavorite,
  getFavorite,
  updateFavorite,
  deleteFavorite,
  getFavoriteDetails,
};
