const coachingStyleRepo = require("./coachingStyleRepository");

const getCoachingStyles = async (filter = {}) => {
  const coachingStyles = await coachingStyleRepo.getCoachingStyles(filter);
  return {
    coachingStyles,
  };
};

const getCoachingStyleById = async (id) => {
  return coachingStyleRepo.findCoachingStyleById(id);
};

const createCoachingStyle = async ({ title, status }) => {
  return coachingStyleRepo.createCoachingStyle({
    title,
    status,
  });
};

const updateCoachingStyle = async (id, { title, status }) => {
  return coachingStyleRepo.updateCoachingStyleById(id, { title, status });
};

const deleteCoachingStyle = async (id) => {
  return coachingStyleRepo.deleteCoachingStyleById(id);
};

module.exports = {
  getCoachingStyles,
  getCoachingStyleById,
  createCoachingStyle,
  updateCoachingStyle,
  deleteCoachingStyle,
};
