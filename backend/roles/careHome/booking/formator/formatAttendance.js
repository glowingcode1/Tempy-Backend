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
    checkOutProofPicture: getFullImageUrl(attendance.checkOutProofPicture),
    checkOutSignature: getFullImageUrl(attendance.checkOutSignature),
    /*
     * The shift was closed by the system and the worker still owes the
     * picture, signature and reason for it — which is what blocks their next
     * check-in, so the app needs to see it.
     */
    checkOutProofPending: Boolean(
      attendance.autoCheckedOut &&
        (!attendance.checkOutProofPicture || !attendance.checkOutSignature),
    ),
  };
};

module.exports = { formatAttendance };
