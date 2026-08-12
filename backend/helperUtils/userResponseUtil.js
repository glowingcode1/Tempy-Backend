// helperUtils/userResponseUtil.js

const { notify } = require("@appEngagement/engagementEventsRoutes");
const { createVerificationLink } = require("../models/UserModel");
const { getFullImageUrl } = require("@helperUtils/imageHelper");

const hasValidLocation = (location = {}) => {
  if (!location || typeof location !== "object") return false;
  const hasCoordinates =
    Array.isArray(location.coordinates) && location.coordinates.length === 2;
  const hasAddressFields =
    !!location.fullAddress ||
    !!location.city ||
    !!location.country ||
    !!location.state ||
    !!location.postalCode;
  return hasCoordinates || hasAddressFields;
};

const isUserProfileComplete = (userObject = {}) => {
  const userType =
    userObject.accountState?.userType || userObject.userType || "user";
  const locationComplete = hasValidLocation(userObject.location);

  if (userType === "admin") return true;

  if (userType === "user" || userType === "userDescriminator") {
    return (
      locationComplete &&
      Array.isArray(userObject.governmentIdentity) &&
      userObject.governmentIdentity.length > 0
    );
  }

  if (userType === "nurse") {
    return (
      locationComplete &&
      Boolean(userObject.taxNumber) &&
      Array.isArray(userObject.governmentIdentity) &&
      userObject.governmentIdentity.length > 0 &&
      Array.isArray(userObject.degree) &&
      userObject.degree.length > 0 &&
      Array.isArray(userObject.certification) &&
      userObject.certification.length > 0
    );
  }

  if (
    [
      "agency",
      "homeCareCompany",
      "hospital",
      "localAuthority",
      "careHome",
    ].includes(userType)
  ) {
    return (
      locationComplete &&
      Boolean(userObject.companyName) &&
      Boolean(userObject.registrationNumber) &&
      Array.isArray(userObject.validationDocument) &&
      userObject.validationDocument.length > 0
    );
  }

  return false;
};

const formatUserResponse = (
  userObject,
  token = null,
  includeFields = [],
  excludeFields = [],
) => {
  if (!userObject) return null;
  const subAdmin =
    userObject.orignalUserType === "subAdmin"
      ? {
          permissions: userObject.permissions,
          orignalUserType: userObject.orignalUserType,
          orignalSubAdminId: userObject.orignalSubAdminId,
        }
      : null;

  const pIcon = getFullImageUrl(userObject?.profileIcon) || null;
  const userType = userObject.accountState?.userType;
  // Construct basicInfo cleanly using conditionals
  const basicInfo = {
    _id: userObject._id,
    profileIcon: pIcon,
    name: userObject.name,
    email: userObject.email,
    gender: userObject.gender,
    phoneNumber: userObject.phoneNumber || "",
    language: userObject.language,
    country: userObject.country,
    isOnboardingCompletedDoc: userObject.isOnboardingCompletedDoc,
  };
  const location = userObject.location || null;

  // Main response object
  let response = {
    basicInfo,
    accountState: {
      twoFactorAuth: userObject.twoFA?.isEnabled || false,
      userType: userType || "user",
      status: userObject.accountState?.status || "active",
      verificationStatus: {
        email: userObject.verificationStatus?.email || "pending",
        phoneNumber: userObject.verificationStatus?.phoneNumber || "pending",
      },
      blueTick: userObject.accountState?.blueTick?.isActive || false,
    },
    location,
    ...(subAdmin ? { subAdmin } : {}),
    averageRating: userObject.averageRating || 0,
    totalReviews: userObject.totalReviews || 0,
    completeDetails: isUserProfileComplete(userObject),

    metadata: {
      timezone: userObject.timezone,
      createdAt: userObject.createdAt,
      updatedAt: userObject.updatedAt,
      __v: userObject.__v,
    },
  };

  if (userType == "user") {
    // basicInfo.dob = userObject.dob || "";
    // basicInfo.gender = userObject.gender || "";
    // basicInfo.username = userObject.username || "";
  } else if (userType == "admin") {
    // Removed location for admin userType
  }

  // Include OTP info in dev only
  if (
    (process.env.NODE_ENV === "dev" ||
      process.env.NODE_ENV === "mobileapps" ||
      process.env.NODE_ENV === "localhost") &&
    userObject.otpInfo &&
    userObject.otpInfo.emailOtp.otp !== ""
  ) {
    response.otpInfo = userObject.otpInfo;
  }

  // Include email verification info in dev only
  if (
    (process.env.NODE_ENV === "dev" ||
      process.env.NODE_ENV === "mobileapps" ||
      process.env.NODE_ENV === "localhost") &&
    userObject.emailVerificationLink
  ) {
    response.emailVerification = createVerificationLink(
      userObject.emailVerificationLink,
    );
  }

  // Include resetToken if available
  if (userObject.resetToken) {
    response.resetToken = userObject.resetToken;
  }

  // Add token if provided
  if (token) {
    response.token = token;
  }

  // Handle includeFields
  if (includeFields.length > 0) {
    const filtered = {};
    includeFields.forEach((field) => {
      if (response[field]) {
        filtered[field] = response[field];
      }
    });
    return filtered;
  }

  // Handle excludeFields
  if (excludeFields.length > 0) {
    excludeFields.forEach((fieldPath) => {
      const [mainField, subField] = fieldPath.split(".");
      if (subField) {
        if (response[mainField]) {
          delete response[mainField][subField];
        }
      } else {
        delete response[fieldPath];
      }
    });
  }

  return response;
};

//attach url to profile icon without any other formatting
const formatUserProfileIconOnly = (userObject) => {
  if (!userObject) return null;
  const pIcon = getFullImageUrl(userObject?.profileIcon) || null;
  userObject.profileIcon = pIcon;
  return userObject;
};

module.exports = {
  formatUserResponse,
  formatUserProfileIconOnly,
  isUserProfileComplete,
};
