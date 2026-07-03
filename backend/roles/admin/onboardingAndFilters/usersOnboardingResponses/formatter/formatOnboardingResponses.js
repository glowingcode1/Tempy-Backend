const { getFullImageUrl } = require("@helperUtils/imageHelper");

//Single item formatter
const formatOnboardingResponse = (item) => {
  if (!item) return null;

  const obj = item.toObject ? item.toObject() : { ...item };


return obj;
};

// List formatter
const formatOnboardingResponses = (data = []) => {
  if (!Array.isArray(data)) return [];
  return data.map(formatOnboardingResponse);
};

module.exports = {
  formatOnboardingResponse,
  formatOnboardingResponses,
};