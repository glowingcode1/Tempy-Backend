const { getFullImageUrl } = require("@helperUtils/imageHelper.js");
const responseUtil = require("../../../../helperUtils/responseUtil.js");
const { convertUtcToTimezone, formatShiftToTimezone } = responseUtil;
const { isArray } = require("lodash");

const fileNameFromUrl = (url) => {
  const last = String(url).split("?")[0].split("/").pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

// Documents are { name, url }; older jobs stored the URL string alone.
const formatDocument = (doc) => {
  if (typeof doc === "string") {
    return {
      name: fileNameFromUrl(doc),
      url: getFullImageUrl(doc),
    };
  }
  if (doc && typeof doc === "object") {
    return { ...doc, url: doc.url ? getFullImageUrl(doc.url) : doc.url };
  }
  return doc;
};

// Stored as a UTC day plus "HH:mm" UTC start, so this is the real start.
const shiftStartMs = (shift) => {
  const day = shift?.date ? new Date(shift.date).getTime() : NaN;
  const [hours, minutes] = String(shift?.startTime || "").split(":").map(Number);
  const offset =
    Number.isFinite(hours) && Number.isFinite(minutes)
      ? (hours * 60 + minutes) * 60000
      : 0;
  return Number.isFinite(day) ? day + offset : Infinity; // undated last
};

// Earliest shift first. Sorted before converting to the viewer's timezone,
// where the local date/time strings would no longer order correctly.
const sortShifts = (shifts) =>
  [...shifts].sort((a, b) => shiftStartMs(a) - shiftStartMs(b));

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
      ? job.documents.map(formatDocument)
      : job.documents,
    snapshot: formatSnapshot(job.snapshot),
    shift: Array.isArray(job.shift)
      ? sortShifts(job.shift).map(formatShift)
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
