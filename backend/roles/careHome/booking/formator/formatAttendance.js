const { getFullImageUrl } = require("@helperUtils/imageHelper");
const { convertUtcToTimezone } = require("@helperUtils/responseUtil");

const formatAttendance = (attendance, timezone) => {
  if (!attendance) return attendance;

  return {
    ...attendance,
    checkIn: attendance.checkIn
      ? convertUtcToTimezone(attendance.checkIn, timezone)
      : attendance.checkIn,
    checkOut: attendance.checkOut
      ? convertUtcToTimezone(attendance.checkOut, timezone)
      : attendance.checkOut,
    proofPicture: getFullImageUrl(attendance.proofPicture),
    signature: getFullImageUrl(attendance.signature),
  };
};

module.exports = { formatAttendance };
