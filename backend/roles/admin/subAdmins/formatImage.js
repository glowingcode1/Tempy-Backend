import { getFullImageUrl } from "../../../helperUtils/imageHelper.js";
const formatSubAdmins = (subAdmins = []) => {
  return subAdmins.map((item) => ({
    ...item,

    creator: {
      ...item?.creator,

      profileIcon: getFullImageUrl(item?.creator?.profileIcon),
    },

    user: {
      ...item?.user,

      profileIcon: getFullImageUrl(item?.user?.profileIcon),
    },
  }));
};

export { formatSubAdmins };
