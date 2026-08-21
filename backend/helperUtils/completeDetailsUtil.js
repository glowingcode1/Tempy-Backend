const REQUIRED_FIELDS_BY_USER_TYPE = {
  careHome: ["companyName", "type", "registrationNumber", "validationDocument"],
  hospital: ["companyName", "type", "registrationNumber", "validationDocument"],
  localAuthority: [
    "companyName",
    "type",
    "registrationNumber",
    "validationDocument",
  ],
  agency: ["companyName", "type", "registrationNumber", "validationDocument"],
  homeCareCompany: [
    "companyName",
    "type",
    "registrationNumber",
    "validationDocument",
  ],
  nurse: ["taxNumber", "governmentIdentity", "degree", "certification"],
  user: ["taxNumber", "governmentIdentity"],
  guest: [],
  admin: [],
  // TODO: add "employee" here once its discriminator schema exists (see Issue 2)
};

const isValuePresent = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

// Intentionally ignores phoneNumber per requirement
const isUserProfileComplete = (userObject = {}) => {
  const userType = userObject?.accountState?.userType || userObject?.userType;
  const requiredFields = REQUIRED_FIELDS_BY_USER_TYPE[userType];
  if (!requiredFields) return false; // unknown/unconfigured type -> treat as incomplete, not silently true
  return requiredFields.every((field) => isValuePresent(userObject[field]));
};

module.exports = { REQUIRED_FIELDS_BY_USER_TYPE, isUserProfileComplete };
