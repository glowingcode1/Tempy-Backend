const homeRepository = require("./homeRepository");

const getHome = async ({ userId, timezone, userType }) => {
  return homeRepository.getHomeData({
    userId,
    timezone,
    userType,
  });
};

module.exports = {
  getHome,
};
