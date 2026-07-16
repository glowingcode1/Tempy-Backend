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
