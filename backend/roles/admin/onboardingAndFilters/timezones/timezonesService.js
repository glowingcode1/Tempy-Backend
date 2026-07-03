const timezonesRepo = require("./timezonesRepository");

const getTimezones = async (filter = {}) => {
  const timezones = await timezonesRepo.getTimezones(filter);
  return {
    timezones,
  };
};

const getTimezoneById = async (id) => {
  return timezonesRepo.findTimezoneById(id);
};

const createTimezone = async ({ title, status }) => {
  return timezonesRepo.createTimezone({
    title,
    status,
  });
};

const updateTimezone = async (id, { title, status }) => {
  return timezonesRepo.updateTimezoneById(id, { title, status });
};

const deleteTimezone = async (id) => {
  return timezonesRepo.deleteTimezoneById(id);
};

module.exports = {
  getTimezones,
  getTimezoneById,
  createTimezone,
  updateTimezone,
  deleteTimezone,
};
