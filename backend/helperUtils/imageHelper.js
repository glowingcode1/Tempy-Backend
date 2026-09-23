function getFullImageUrl(imagePath, baseUrl = process.env.S3_BASE_URL || "") {
  if (imagePath && !imagePath.startsWith("http")) {
    return baseUrl + imagePath;
  }
  return imagePath || baseUrl + "noimage.png";
}

// Like getFullImageUrl, but an empty path stays empty instead of becoming the
// placeholder image. For documents and signatures that may not exist yet.
const getFullFileUrl = (filePath) =>
  filePath ? getFullImageUrl(filePath) : filePath;

// A populated (plain object) user with its profileIcon turned into a full URL.
// Anything else - an ObjectId, null - is returned as it is. An ObjectId also
// answers to ._id, but only through its prototype, hence the own-property test.
const withFullProfileIcon = (user) =>
  user && typeof user === "object" && Object.hasOwn(user, "_id")
    ? { ...user, profileIcon: getFullImageUrl(user.profileIcon) }
    : user;

module.exports = { getFullImageUrl, getFullFileUrl, withFullProfileIcon };
