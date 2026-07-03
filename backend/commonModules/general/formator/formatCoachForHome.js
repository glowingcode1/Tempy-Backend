const { getFullImageUrl } = require("@helperUtils/imageHelper");


const formatCoachForHome = (coach) => {
  const user = coach.user || {};

  return {
    ...coach,
    user: {
      ...user,
      profileIcon: getFullImageUrl(user.profileIcon || "noimage.png"),
    },
  };
};

module.exports = {
  formatCoachForHome,
};