const { getFullImageUrl } = require("@helperUtils/imageHelper");
const { convertUtcToTimezone } = require("@helperUtils/responseUtil");

const formateBranchToTimezone = (branch, timezone) => {
  if (!branch) return branch;

  const obj = branch.toObject ? branch.toObject() : { ...branch };

  if (obj.createdAt) {
    obj.createdAt = convertUtcToTimezone(obj.createdAt, timezone);
  }
  if (obj.updatedAt) {
    obj.updatedAt = convertUtcToTimezone(obj.updatedAt, timezone);
  }

  if (obj.images?.length) {
    obj.images = obj.images.map((img) => getFullImageUrl(img));
  }
  if (obj.cqc?.certificate) {
    obj.cqc.certificate = getFullImageUrl(obj.cqc.certificate);
  }
  if (obj.insurance?.certificate) {
    obj.insurance.certificate = getFullImageUrl(obj.insurance.certificate);
  }

  if (obj.user) {
    const user = obj.user.toObject ? obj.user.toObject() : { ...obj.user };

    if (user.profileIcon) {
      user.profileIcon = getFullImageUrl(user.profileIcon);
    }

    obj.user = user;
  }

  return obj;
};

module.exports = formateBranchToTimezone;
