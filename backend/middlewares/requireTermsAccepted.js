const { sendResponse } = require("../helperUtils/responseUtil");
const { User, supplierTypes } = require("../models/UserModel");
const {
  getCurrentTermsVersion,
} = require("../roles/admin/settings/controllers/adminSettingsController");

/*
 * Suppliers (agencies, home care companies and solo nurses) must have
 * accepted the current terms and conditions, which say they won't go direct
 * with the customer. Everyone else passes straight through.
 */
const requireTermsAccepted = async (req, res, next) => {
  if (!supplierTypes.includes(req.user?.userType)) {
    return next();
  }

  try {
    const [currentVersion, user] = await Promise.all([
      getCurrentTermsVersion(),
      User.findById(req.user._id, "termsAccepted").lean(),
    ]);

    if (user?.termsAccepted?.version !== currentVersion) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "terms_acceptance_required",
      });
    }

    return next();
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = requireTermsAccepted;
