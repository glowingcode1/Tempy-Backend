const moment = require("moment-timezone");

const formateBranchToTimezone = (branch, timezone) => {
  if (!branch) return branch;

  const obj = branch.toObject ? branch.toObject() : { ...branch };
  const tz = timezone || "UTC";

  if (obj.createdAt) {
    obj.createdAt = moment(obj.createdAt).tz(tz).format();
  }
  if (obj.updatedAt) {
    obj.updatedAt = moment(obj.updatedAt).tz(tz).format();
  }

  return obj;
};

module.exports = formateBranchToTimezone;
