const { getFullImageUrl } = require("@helperUtils/imageHelper");
const { convertUtcToTimezone } = require("@helperUtils/responseUtil");

const formatUserBlock = (userObj) => {
  if (!userObj) return userObj;
  const user = userObj.toObject ? userObj.toObject() : { ...userObj };

  if (user.profileIcon) {
    user.profileIcon = getFullImageUrl(user.profileIcon);
  }

  return user;
};

const formatAvailabilityToTimezone = (availability, timezone) => {
  if (!availability) return availability;

  const obj = availability.toObject
    ? availability.toObject()
    : { ...availability };

  if (obj.createdAt) {
    obj.createdAt = convertUtcToTimezone(obj.createdAt, timezone);
  }
  if (obj.updatedAt) {
    obj.updatedAt = convertUtcToTimezone(obj.updatedAt, timezone);
  }
  if (obj.startDateTime) {
    obj.startDateTime = convertUtcToTimezone(obj.startDateTime, timezone);
  }
  if (obj.endDateTime) {
    obj.endDateTime = convertUtcToTimezone(obj.endDateTime, timezone);
  }

  if (obj.user) {
    obj.user = formatUserBlock(obj.user);
  }

  if (obj.creator) {
    obj.creator = formatUserBlock(obj.creator);
  }

  return obj;
};

module.exports = formatAvailabilityToTimezone;
