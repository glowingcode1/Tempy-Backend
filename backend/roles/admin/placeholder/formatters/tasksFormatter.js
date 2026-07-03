const { convertUtcToTimezone } = require("@helperUtils/responseUtil");
const { getFullImageUrl } = require("@helperUtils/imageHelper");

const addProfileImage = (user) => {
  if (!user) return user;

  return {
    ...user,
    profileIcon: getFullImageUrl(user.profileIcon || "noimage.png"),
  };
};

function formatTask(item, timezone) {
  if (!item) return null;

  const obj = item.toObject ? item.toObject() : { ...item };

  if (obj.date) {
    obj.date = convertUtcToTimezone(obj.date, timezone);
  }

  obj.user = addProfileImage(obj.user);

  return obj;
}

function formatTasks(tasks = [], timezone) {
  return tasks.map((task) => formatTask(task, timezone));
}

module.exports = {
  formatTask,
  formatTasks,
};
