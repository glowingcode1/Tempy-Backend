const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const JobRepo = require("./jobRepository");
const { cache, invalidate } = require("@redisCache");
const formatJobToTimezone = require("./formator/formatJobToTimezone");

const createJob = async (data) => {
  const Job = await JobRepo.createJob(data);
  return Job;
};

const getJobs = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  userType,
  requester,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { Jobs, meta } = await JobRepo.getJobs({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    skip,
    userType,
    requester,
  });
  const formatedJobs = Jobs.map((job) => {
    return formatJobToTimezone(job, timezone);
  });

  return { Jobs: formatedJobs, meta };
};

const updateJob = async (id, data) => {
  const Job = await JobRepo.findJobById_(id);

  if (!Job) {
    return { error: "Job_not_found" };
  }

  const allowedFields = [
    "name",
    "description",
    "type",
    "gender",
    "status",
    "shift",
    "location",
    "isBreak",
    "breakMin",
    "type",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Job;
  }


  Object.assign(Job, updateData);
  await Job.save();

  return Job;
};

const getJobDetails = async (id, timezone) => {
  const Job = await JobRepo.findJobById(id);

  if (!Job) {
    return null;
  }

  return formatJobToTimezone(Job, timezone);
};
const deleteJob = async (id) => {
  if (!id) throw new Error("Job ID is required");

  const deleted = await JobRepo.deleteJob(id);

  if (deleted) {
    await invalidateJobCache();
  }

  return !!deleted;
};

module.exports = {
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobDetails,
};
