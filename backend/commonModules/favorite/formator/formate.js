const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;

const formate = (job, timezone) => {
  if (!job) return job;

  const formatShift = (shift) => formatShiftToTimezone(shift, timezone);

  return {
    ...job,
    shift: Array.isArray(job.shift) ? job.shift.map(formatShift) : job.shift,
    user: {
      ...job.user,
      profileIcon: getFullImageUrl(job.user.profileIcon),
    },
    favoriteUser: {
      ...job.favoriteUser,
      profileIcon: getFullImageUrl(job.favoriteUser.profileIcon),
    },
    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formate;
