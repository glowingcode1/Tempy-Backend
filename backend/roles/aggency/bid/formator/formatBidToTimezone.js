const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;

const formatBidToTimezone = (job, timezone) => {
  if (!job) return job;

  const formatUser = (user) => {
    if (!user || !Object.prototype.hasOwnProperty.call(user, "profileIcon")) {
      return user;
    }

    return {
      ...user,
      profileIcon: getFullImageUrl(user.profileIcon),
    };
  };

  const formatShift = (shift) => formatShiftToTimezone(shift, timezone);

  const formatSnapshot = (snapshot) => {
    if (!snapshot) return snapshot;
    return {
      ...snapshot,
      shift: Array.isArray(snapshot.shift)
        ? snapshot.shift.map(formatShift)
        : formatShift(snapshot.shift),
    };
  };

  return {
    ...job,
    shift: Array.isArray(job.shift)
      ? job.shift.map(formatShift)
      : formatShift(job.shift),
    snapshot: formatSnapshot(job.snapshot),
    user: formatUser(job.user),
    jobCreator: formatUser(job.jobCreator),
    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formatBidToTimezone;
