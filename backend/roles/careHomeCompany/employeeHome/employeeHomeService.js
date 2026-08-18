const homeRepository = require("./employeeHomeRepository");

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
