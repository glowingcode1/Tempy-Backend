const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;

const formatStaff = (job, timezone, customer) => {
  if (!job) return job;

  const formatShift = (shift) => formatShiftToTimezone(shift, timezone);
  if (customer) {
    return {
      ...job,
      shift: Array.isArray(job.shift) ? job.shift.map(formatShift) : job.shift,
      user: {
        ...job.user,
        profileIcon: getFullImageUrl(job.user.profileIcon),
      },
      worker: {
        ...job.worker,
        profileIcon: getFullImageUrl(job.worker?.profileIcon),
      },
      employer: {
        ...job.employer,
        profileIcon: getFullImageUrl(job.employer?.profileIcon),
      },
      createdAt: job.createdAt
        ? convertUtcToTimezone(job.createdAt, timezone)
        : job.createdAt,
      updatedAt: job.updatedAt
        ? convertUtcToTimezone(job.updatedAt, timezone)
        : job.updatedAt,
    };
  }
  return {
    ...job,
    shift: Array.isArray(job.shift) ? job.shift.map(formatShift) : job.shift,
    user: {
      ...job.user,
      profileIcon: getFullImageUrl(job.user.profileIcon),
    },
    staff: {
      ...job.staff,
      profileIcon: getFullImageUrl(job.staff?.profileIcon),
    },
    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formatStaff;
