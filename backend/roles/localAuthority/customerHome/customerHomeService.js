const homeRepository = require("./customerHomeRepository");

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
