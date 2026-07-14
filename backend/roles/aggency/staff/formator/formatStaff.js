const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone } = responseUtil;
const moment = require("moment-timezone");

const formatStaff = (job, timezone, customer) => {
  if (!job) return job;

  const formatShift = (shift) => {
    // date-only portion of the shift date, used to anchor the HH:mm times
    const datePart = moment.utc(shift.date).format("YYYY-MM-DD");

    const startUtc = `${datePart}T${shift.startTime}:00.000Z`;
    const endUtc = `${datePart}T${shift.endTime}:00.000Z`;

    return {
      ...shift,
      date: convertUtcToTimezone(shift.date, timezone),
      startTime: convertUtcToTimezone(startUtc, timezone, "HH:mm"),
      endTime: convertUtcToTimezone(endUtc, timezone, "HH:mm"),
    };
  };
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
