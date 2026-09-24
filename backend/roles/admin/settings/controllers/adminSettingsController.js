const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
} = require("@helperUtils/responseUtil");
const { User, supplierTypes } = require("../../../../models/UserModel");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const AdminSettings = require("../models/AdminSettings");
const Faq = require("../models/Faq");
const { cache, invalidate } = require("@redisCache");
const SupportRequest = require("@SupportRequestModel");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";

const buildAdminSettingsCacheKey = ({ scope = "public", type, user }) => {
  return `${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}:${type}:${user}`;
};

const invalidateAdminSettingsScope = async (scope) => {
  await invalidate(buildAdminSettingsCacheKey({ scope }));
};

const ADMIN_SETTING_SCOPES = {
  TERMS: "terms_conditions",
  REVIEW_TERMS: "review_terms_conditions",
  CUSTOMER_TERMS: "customer_terms_conditions",
  ABOUT_US: "about_us",
  PRIVACY_POLICY: "privacy_policy",
  FAQS: "faqs",
  SUPPORT: "support",
};

// Get Terms and Conditions
const getTermsAndConditions = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: ADMIN_SETTING_SCOPES.TERMS,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "terms_and_conditions terms_version");
      },
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "terms_and",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "terms_and_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};
const getReviewTermsAndConditions = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: ADMIN_SETTING_SCOPES.REVIEW_TERMS,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "review_terms_and_conditions");
      },
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "review_terms_and_conditions",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_terms_and_conditions_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get About Us
const getAboutUs = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: ADMIN_SETTING_SCOPES.ABOUT_US,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "about_us");
      },
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "about_us",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "about_us_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get Privacy Policy
const getPrivacyPolicy = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: ADMIN_SETTING_SCOPES.PRIVACY_POLICY,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "privacy_policy");
      },
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "privacy_policy",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "privacy_policy_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get Privacy Policy
const getFaqs = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword } = req.query;

    const skip = (page - 1) * limit;
    const type = req.user.userType;

    const cacheKey = buildAdminSettingsCacheKey({
      scope: ADMIN_SETTING_SCOPES.FAQS,
      skip,
      limit,
      type: req.user.userType,
    });

    const result = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        let queryConditions = {};
        if (type) {
          queryConditions.type = type;
        }

        if (keyword && keyword.trim() !== "") {
          queryConditions.$or = [
            { question: { $regex: keyword, $options: "i" } },
            { answer: { $regex: keyword, $options: "i" } },
          ];
        }

        const [faqs, totalRecords] = await Promise.all([
          Faq.find(queryConditions)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
          Faq.countDocuments(queryConditions),
        ]);

        return {
          faqs,
          totalRecords,
        };
      },
    });

    const meta = generateMeta(page, limit, result.totalRecords);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "faqs_fetched_successfully",
      data: result.faqs,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "something_went_wrong",
      error,
    });
  }
};

// Get Support
const getSupport = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword } = req.query;

    const skip = (page - 1) * limit;

    let queryConditions = {
      user: req.user._id,
      status: { $ne: "deleted" },
    };

    if (keyword && keyword.trim() !== "") {
      queryConditions.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { ticket: { $regex: keyword, $options: "i" } },
        { subject: { $regex: keyword, $options: "i" } },
        { message: { $regex: keyword, $options: "i" } },
        { response: { $regex: keyword, $options: "i" } },
      ];
    }

    const [supports, totalRecords] = await Promise.all([
      SupportRequest.find(queryConditions)
        .populate("user", "name email profileIcon")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      SupportRequest.countDocuments(queryConditions),
    ]);

    const meta = generateMeta(page, limit, totalRecords);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "support_requests_fetched_successfully",
      data: supports,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "something_went_wrong",
      error,
    });
  }
};

// Create Admin Settings
const createAdminSettings = async (req, res) => {
  try {
    // invalidate only relevant sections
    await Promise.all([
      invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.TERMS),
      invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.ABOUT_US),
      invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.PRIVACY_POLICY),
      invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.REVIEW_TERMS),
      invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.CUSTOMER_TERMS),
    ]);

    const {
      terms_and_conditions,
      about_us,
      privacy_policy,
      review_terms_and_conditions,
    } = req.body;

    const existingSettings = await AdminSettings.findOne();
    if (existingSettings) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "admin_settings",
      });
    }

    const newSettings = new AdminSettings({
      terms_and_conditions: terms_and_conditions || "",
      about_us: about_us || "",
      privacy_policy: privacy_policy || "",
      review_terms_and_conditions: review_terms_and_conditions || "",
    });

    const savedSettings = await newSettings.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "admin_settings_1",
      data: savedSettings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Every supplier has to accept new terms, so tell them all.
const notifySuppliersOfNewTerms = async (version, adminId) => {
  try {
    const suppliers = await User.find(
      {
        "accountState.userType": { $in: supplierTypes },
        "accountState.status": { $ne: "deleted" },
      },
      "_id",
    ).lean();
    if (!suppliers.length) return;

    await sendUserNotifications({
      recipientIds: suppliers.map((supplier) => supplier._id),
      title: "Terms And Conditions Updated",
      body: "Our terms and conditions have changed. Please accept the new version to keep bidding and sending rate offers.",
      data: {
        type: NotificationTypes.TERMS_UPDATED,
        objectType: "AdminSettings",
        version,
      },
      sender: adminId,
    });
  } catch (error) {
    console.error("Error notifying suppliers of new terms:", error);
  }
};

// Update Admin Settings (Optional: To update multiple fields at once)
const updateAdminSettings = async (req, res) => {
  const { id } = req.params;
  const updateData = {};

  const invalidations = [];

  if (req.body.terms_and_conditions) {
    updateData.terms_and_conditions = req.body.terms_and_conditions;
    invalidations.push("terms_and_conditions");
  }
  if (req.body.review_terms_and_conditions) {
    updateData.review_terms_and_conditions =
      req.body.review_terms_and_conditions;
    invalidations.push("review_terms_and_conditions");
  }

  if (req.body.customer_terms_and_conditions) {
    updateData.customer_terms_and_conditions =
      req.body.customer_terms_and_conditions;
    invalidations.push("customer_terms_and_conditions");
  }

  if (req.body.about_us) {
    updateData.about_us = req.body.about_us;
    invalidations.push("about_us");
  }

  if (req.body.privacy_policy) {
    updateData.privacy_policy = req.body.privacy_policy;
    invalidations.push("privacy_policy");
  }

  for (const key of ["temp_to_perm_min_shifts", "temp_to_perm_fee"]) {
    if (req.body[key] !== undefined) updateData[key] = Number(req.body[key]);
  }

  // New terms mean everyone has to accept again.
  const update = { $set: updateData };
  if (req.body.terms_and_conditions) {
    update.$inc = { terms_version: 1 };
  }

  // invalidate only touched scopes
  await Promise.all([
    invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.TERMS),
    invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.ABOUT_US),
    invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.PRIVACY_POLICY),
    invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.REVIEW_TERMS),
    invalidateAdminSettingsScope(ADMIN_SETTING_SCOPES.CUSTOMER_TERMS),
  ]);

  try {
    const settings = await AdminSettings.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "admin_settings_2",
      });
    }

    if (req.body.terms_and_conditions) {
      void notifySuppliersOfNewTerms(settings.terms_version, req.user._id);
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "admin_settings_3",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const getCustomerTermsAndConditions = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: "customer_terms_conditions",
      skip: 0,
      limit: 10,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "customer_terms_and_conditions");
      },
    });

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "terms_and",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "terms_and_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const getCurrentTermsVersion = async () => {
  const settings = await AdminSettings.findOne({}, "terms_version").lean();
  return settings?.terms_version || 1;
};

// Whether the signed-in user has accepted the current terms.
const getTermsStatus = async (req, res) => {
  try {
    const [currentVersion, user] = await Promise.all([
      getCurrentTermsVersion(),
      User.findById(req.user._id, "termsAccepted").lean(),
    ]);
    const accepted = user?.termsAccepted || { version: 0, acceptedAt: null };

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "terms_status_fetched",
      data: {
        currentVersion,
        acceptedVersion: accepted.version,
        acceptedAt: accepted.acceptedAt,
        needsAcceptance: accepted.version !== currentVersion,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Records that the signed-in user accepted the current terms version.
const acceptTerms = async (req, res) => {
  try {
    const version = await getCurrentTermsVersion();
    const termsAccepted = { version, acceptedAt: new Date() };

    await User.updateOne({ _id: req.user._id }, { $set: { termsAccepted } });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "terms_accepted_successfully",
      data: termsAccepted,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getCurrentTermsVersion,
  getTermsStatus,
  acceptTerms,
  getTermsAndConditions,
  getAboutUs,
  getPrivacyPolicy,
  updateAdminSettings,
  createAdminSettings,
  getFaqs,
  getSupport,
  getCustomerTermsAndConditions,
  getReviewTermsAndConditions,
};
