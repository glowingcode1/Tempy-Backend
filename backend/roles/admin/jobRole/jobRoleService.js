const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const JobRoleRepo = require("./jobRoleRepository");

const createJobRole = async (data) => {
  const JobRole = await JobRoleRepo.createJobRole(data);
  return JobRole;
};

const getJobRole = async ({ timezone, page, limit, keyword, status, user }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { jobRole, meta } = await JobRoleRepo.getJobRole({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });

  return { jobRole, meta };
};

const updateJobRole = async (id, data) => {
  const JobRole = await JobRoleRepo.findJobRoleById_(id);


  const allowedFields = [
    "department",
    "title",
    "status",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return JobRole;
  }


  Object.assign(JobRole, updateData);
  await JobRole.save();

  return JobRole;
};

const getJobRoleDetails = async (id, timezone) => {
  const JobRole = await JobRoleRepo.findJobRoleById(id);

  if (!JobRole) {
    return null;
  }

  return formatJobRoleToTimezone(JobRole, timezone);
};
const deleteJobRole = async (id) => {
  if (!id) throw new Error("JobRole ID is required");
  const deleted = await JobRoleRepo.deleteJobRole(id);
  return !!deleted;
};

module.exports = {
  createJobRole,
  getJobRole,
  updateJobRole,
  deleteJobRole,
  getJobRoleDetails,
};
