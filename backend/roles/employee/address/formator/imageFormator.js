import { getFullImageUrl } from "../../../../helperUtils/imageHelper.js";

const formatUser = (user) => {
  if (!user) return null;

  return {
    ...user,
    profileIcon: user.profileIcon ? getFullImageUrl(user.profileIcon) : null,
  };
};

export { formatUser };
