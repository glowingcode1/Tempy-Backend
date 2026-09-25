const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { User } = require("../models/UserModel");
const { sendResponse } = require("../helperUtils/responseUtil");
const { i18nConfig } = require("../config/i18nConfig");
const { userCache } = require("../config/nodeCache");

const hasField = (obj, path) => {
  return (
    path.split(".").reduce((o, key) => (o ? o[key] : undefined), obj) !==
    undefined
  );
};

// The admin panel's own APIs, where ?userId= is an admin filter, not a view-as.
const ADMIN_API_PREFIXES = [
  "/api/v1/admin",
  "/api/v1/users",
  "/api/v1/dashboard",
];

/*
 * An admin viewing someone's account from the admin panel sends that
 * account's id as ?userId=. Reads then run as that account, so every
 * endpoint scopes its data exactly as it would for them. Writes never do:
 * they stay the admin's own.
 */
const getViewedAccountId = (req, user) => {
  const { userId } = req.query;

  if (
    user.userType !== "admin" ||
    req.method !== "GET" ||
    !userId ||
    String(userId) === String(user._id) ||
    ADMIN_API_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))
  ) {
    return null;
  }

  return String(userId);
};

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "auth_header_missing",
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "auth_token_missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded._id;
  
    // Retrieve user from cache if available
    let user = userCache.get(userId);

    // Check if the user object is missing required fields
    const requiredFields = [
      "name",
      "profileIcon",
      "timezone",
      "language",
      "location",
      "userType",
      // Cached before these existed -> refetch rather than gate on undefined.
      "accountStatus",
      "personaVerified",
      "accountState"
    ];

    const isMissingRequiredFields =
      !user || requiredFields.some((field) => !hasField(user, field));

    if (!user || isMissingRequiredFields) {
      const selectFields =
        "name profileIcon email timezone language location accountState verificationStatus";
      user = await User.findById(userId).select(selectFields);

      if (!user) {
        return sendResponse({
          res,
          statusCode: 401,
          translationKey: "account_not_found",
        });
      }

      if (
        user.accountState.status === "restricted" ||
        user.accountState.status === "suspended"
      ) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "your_account_2",
        });
      }

      // Immediately convert user to a plain object for modification
      user = user.toObject();
      user.userType = user.accountState.userType;

      /*
       * Flattened alongside userType because accountState is dropped below.
       * Anything that changes either of these must call userCache.del(userId)
       * or the gates below read a stale value for up to an hour.
       *
       * accountStatus  - the admin's decision; controls signing in.
       * personaVerified - the provider's decision; controls taking part in
       *                   the marketplace. They are deliberately separate:
       *                   an activated account still cannot post or bid until
       *                   Persona has approved it.
       */
      user.accountStatus = user.accountState.status;
      user.personaVerified = user.verificationStatus?.persona === true;

      delete user.accountState;

      // Update the cache with the modified user object
      userCache.set(userId, user);
    }

    // Set the locale based on user's language
    i18nConfig.setLocale(req, user.language || "en");
    req.token = token;
    req.user = user;

    const viewedAccountId = getViewedAccountId(req, user);

    if (viewedAccountId) {
      if (!mongoose.Types.ObjectId.isValid(viewedAccountId)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Invalid_user_id",
        });
      }

      // Not cached: the account's own session may be caching a different view
      // of it, and an admin may view a suspended account.
      const viewed = await User.findById(viewedAccountId)
        .select(
          "name profileIcon email timezone language location accountState verificationStatus",
        )
        .lean();

      if (!viewed) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "User_not_found",
        });
      }

      viewed.userType = viewed.accountState?.userType;
      viewed.accountStatus = viewed.accountState?.status;
      viewed.personaVerified = viewed.verificationStatus?.persona === true;
      delete viewed.accountState;

      req.adminUser = user;
      req.user = viewed;
    }

    // Override timezone with client-sent header if provided
    const clientTimezone = req.header("X-Timezone");
    if (clientTimezone) {
      req.user = { ...req.user, timezone: clientTimezone };
    }

    next(); // Move to the next middleware/route handler
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 401,
      translationKey: "invalid_token",
      error: error,
    });
  }
};

module.exports = auth;
