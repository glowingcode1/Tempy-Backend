const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone } = responseUtil;
const moment = require("moment-timezone");

const formatBidToTimezone = (job, timezone) => {
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

  return {
    ...job,
    shift: Array.isArray(job.shift) ? job.shift.map(formatShift) : job.shift,
    user: {
      ...job.user,
      profileIcon: getFullImageUrl(job.user.profileIcon),
    },
    jobCreater: {
      ...job.jobCreater,
      profileIcon: getFullImageUrl(job.jobCreater.profileIcon),
    },
    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formatBidToTimezone;
