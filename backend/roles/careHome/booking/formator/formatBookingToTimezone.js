const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;

const formatBookingToTimezone = (job, timezone) => {
  if (!job) return job;

  const formatShift = (shift) => formatShiftToTimezone(shift, timezone);

  const formatSnapshot = (snapshot) => {
    if (!snapshot) return snapshot;
    return {
      ...snapshot,
      image: getFullImageUrl(snapshot.image),
      shift: Array.isArray(snapshot.shift)
        ? snapshot.shift.map(formatShift)
        : formatShift(snapshot.shift),
    };
  };

  return {
    ...job,
    shift: Array.isArray(job.shift)
      ? job.shift.map(formatShift)
      : job.shift
        ? formatShift(job.shift)
        : job.shift,
    snapshot: formatSnapshot(job.snapshot),
    user: {
      ...job.user,
      profileIcon: getFullImageUrl(job.user?.profileIcon),
    },
    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formatBookingToTimezone;
