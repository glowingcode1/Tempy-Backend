const { google } = require("googleapis");
const { oauth2Client, getAuthUrl } = require("../services/googleOAuth");
const UserGoogleIntegration = require("../models/UserGoogleIntegration");
const { sendResponse } = require("../../../helperUtils/responseUtil");

/**
 * STEP 1 - Send auth URL
 */
exports.getAuthUrl = async (req, res) => {
  try {
    const url = getAuthUrl();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "success",
      data: { url },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed",
      error,
    });
  }
};

/**
 * WEB CALLBACK
 */
exports.googleCallback = async (req, res) => {
  try {
    const { code, userId } = req.query;

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();

    const payload = {
      userId,
      googleId: userInfo.data.id,
      email: userInfo.data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      isConnected: true,
    };

    await UserGoogleIntegration.findOneAndUpdate(
      { userId },
      payload,
      {
        upsert: true,
        new: true,
      }
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "google_calendar_connected_successfully",
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "google_auth_failed",
      error,
    });
  }
};

/**
 * STATUS
 */
exports.getStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const data = await UserGoogleIntegration.findOne({ userId });

    if (!data?.isConnected) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "not_connected",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "connected",
      data: {
        connected: true,
        email: data.email,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed",
      error,
    });
  }
};

/**
 * DISCONNECT
 */
exports.disconnect = async (req, res) => {
  try {
    const { _id: userId } = req.user;

    await UserGoogleIntegration.findOneAndDelete({ userId });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "google_account_disconnected",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed",
      error,
    });
  }
};

/**
 * MOBILE APP CONNECT
 */
exports.connectGoogleAccount = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { code } = req.body;

    if (!code) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "missing_auth_code",
      });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    // Get Google profile
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();

    const record = await UserGoogleIntegration.findOneAndUpdate(
      { userId },
      {
        userId,
        googleId: userInfo.data.id,
        email: userInfo.data.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        isConnected: true,
      },
      {
        upsert: true,
        new: true,
      }
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "google_account_connected",
      data: {
        connected: true,
        email: record.email,
      },
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "google_connection_failed",
      error,
    });
  }
};