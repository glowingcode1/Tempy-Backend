const { google } = require("googleapis");
const { getGoogleClient } = require("./googleClient");

async function getCalendar(userId) {
  const auth = await getGoogleClient(userId);

  return google.calendar({
    version: "v3",
    auth,
  });
}

module.exports = { getCalendar };