const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;
const { isArray } = require("lodash");

const formatJobToTimezone = (job, timezone) => {
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

  // total hours between "HH:mm" start and end (handles overnight)
  const getShiftHours = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60; // crosses midnight

    return minutes / 60;
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
    documents: Array.isArray(job.documents)
      ? job.documents.map((doc) => getFullImageUrl(doc))
      : job.documents,
    snapshot: formatSnapshot(job.snapshot),
    shift: Array.isArray(job.shift)
      ? job.shift.map(formatShift)
      : formatShift(job.shift),
    user: formatUser(job.user),
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
