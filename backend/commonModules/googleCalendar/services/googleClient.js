const { google } = require("googleapis");
const UserGoogleIntegration = require("../models/UserGoogleIntegration");

async function getGoogleClient(userId) {
  const user = await UserGoogleIntegration.findOne({ userId });

  if (!user) throw new Error("Google account not connected");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    null,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken, // ⭐ KEY PART
  });

  return oauth2Client;
}

module.exports = { getGoogleClient };