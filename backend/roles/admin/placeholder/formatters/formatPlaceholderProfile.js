const { convertUtcToTimezone } = require("@helperUtils/responseUtil");
const moment = require("moment");

// 🔹 Final formatter
const formatPlaceholderProfileByLocalDate = (
  data,
  timezone = "Asia/Karachi",
) => {
  const formatted = {};

  // Flatten if grouped object is passed
  const tasksArray = Array.isArray(data) ? data : Object.values(data).flat();

  tasksArray.forEach((task) => {
    // ✅ Convert to timezone
    const fullDateTime = convertUtcToTimezone(task.date, timezone);

    if (!fullDateTime) return;

    // ✅ Extract only date for key
    const onlyDate = moment(fullDateTime).format("YYYY-MM-DD");

    if (!formatted[onlyDate]) {
      formatted[onlyDate] = [];
    }
    formatted[onlyDate].push({
      ...task,
      date: fullDateTime,
    });
  });
  return formatted;
};
module.exports = {
  formatPlaceholderProfileByLocalDate,
};