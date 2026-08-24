const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone } = responseUtil;
const moment = require("moment-timezone");
const { isArray } = require("lodash");

const formatJobToTimezone = (job, timezone) => {
  if (!job) return job;

  // total hours between "HH:mm" start and end (handles overnight)
  const getShiftHours = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60; // crosses midnight

    return minutes / 60;
  };

  const formatShift = (shift) => {
    if (!shift) return shift;

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
  let totalHours = undefined;
  let perHour = undefined;
  if (!isArray(job.shift)) {
    // derive perHour from bid amount and shift duration
    const shift = Array.isArray(job.shift) ? job.shift[0] : job.shift;
    totalHours = shift ? getShiftHours(shift.startTime, shift.endTime) : 0;
    perHour =
      totalHours > 0 && typeof job.bid === "number"
        ? Number((job.bid / totalHours).toFixed(2))
        : 0;
  }

  return {
    ...job,
    perHour,
    totalHours,
    image: getFullImageUrl(job.image),
    shift: Array.isArray(job.shift)
      ? job.shift.map(formatShift)
      : formatShift(job.shift),
    user: {
      ...job.user,
      profileIcon: getFullImageUrl(job.user?.profileIcon),
    },
    rating: job.rating
      ? {
          ...job.rating,
          profileIcon: getFullImageUrl(job.rating?.profileIcon),
        }
      : job.rating,

    createdAt: job.createdAt
      ? convertUtcToTimezone(job.createdAt, timezone)
      : job.createdAt,
    updatedAt: job.updatedAt
      ? convertUtcToTimezone(job.updatedAt, timezone)
      : job.updatedAt,
  };
};

module.exports = formatJobToTimezone;
