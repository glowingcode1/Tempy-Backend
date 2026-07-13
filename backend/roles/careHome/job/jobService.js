const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const JobRepo = require("./jobRepository");
const { cache, invalidate } = require("@redisCache");
const formatJobToTimezone = require("./formator/formatJobToTimezone");
const { getBidByJob, findBidById_ } = require("../../../roles/aggency/bid/bidRepository");

const createJob = async (data) => {
  const Job = await JobRepo.createJob(data);
  return Job;
};
const updateJobBidStatus = async (id, status, user) => {
  const JobBid = await findBidById_(id);

  if (!JobBid) {
    return null;
  }
  return
  const updatedBid = await JobRepo.updateJobBidStatus(id, status, user);
  return updatedBid;
};


const getJobBids = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  job,
  shift,
  user,
  jobCreater,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { jobBids, meta } = await getBidByJob({
    timezone,
    page,
    limit,
    keyword,
    status,
    job,
    shift,
    user,
    jobCreater,
    skip,
  });
  const formatedJobBids = jobBids.map((jobBid) => {
    return formatJobToTimezone(jobBid, timezone);
  });

  return { jobBids: formatedJobBids, meta };
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
  latitude, // user's latitude
  longitude, // user's longitude
  km, // radius in kilometers
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
    latitude,
    longitude,
    km,
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
    "type",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }
  console.log("updateData", updateData);

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
  getJobBids,
  getJobDetails,
};
