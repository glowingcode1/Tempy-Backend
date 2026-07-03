const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  null, // No client secret needed for PKCE flow
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // IMPORTANT for refresh_token
    prompt: "consent",      // ensures refresh_token is returned
    scope: SCOPES,
  });
}

module.exports = {
  oauth2Client,
  getAuthUrl,
};