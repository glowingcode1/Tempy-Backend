const { isValidObjectId } = require("mongoose");
const { parsePaginationParams } = require("@helperUtils/responseUtil");
const sendServiceResult = require("@helperUtils/sendServiceResult");
const Service = require("./permanentHireService");
const { notifyPermanentHire } = require("./permanentHireNotifications");

// Runs the handler, then notifies the other side if it succeeded.
const withNotification = (action, handler) => async (req) => {
  const result = await handler(req);
  if (result?.data) notifyPermanentHire(action, result.data, req.user);
  return result;
};

const requestHire = sendServiceResult(
  withNotification("requested", async (req) => {
    const { worker, supplier } = req.body;
    if (!isValidObjectId(worker) || (supplier && !isValidObjectId(supplier))) {
      return { error: "worker_required" };
    }
    return Service.requestHire({
      customer: req.user._id,
      worker,
      supplier: supplier || worker,
    });
  }),
  "Permanent_hire_requested_successfully",
  201,
);

const getHires = sendServiceResult(async (req) => {
  const { page, limit } = parsePaginationParams(req);
  return Service.getHires({
    userId: req.user._id,
    userType: req.user.userType,
    status: req.query.status,
    page,
    limit,
  });
}, "Permanent_hires_fetched_successfully");

const respondToHire = (action, successKey) =>
  sendServiceResult(
    withNotification(action, async (req) =>
      Service.respondToHire({
        id: req.params.id,
        supplier: req.user._id,
        action,
      }),
    ),
    successKey,
  );

const cancelHire = sendServiceResult(
  withNotification("cancelled", async (req) =>
    Service.cancelHire({ id: req.params.id, customer: req.user._id }),
  ),
  "Permanent_hire_cancelled_successfully",
);

// Workers who have done shifts here, so the care home can pick one to hire.
const getEligibleWorkers = sendServiceResult(
  async (req) => Service.getEligibleWorkers({ customer: req.user._id }),
  "Eligible_workers_fetched_successfully",
);

// Shifts needed and the fee, so the care home can see them before asking.
const getTempToPermSettings = sendServiceResult(
  async () => ({ data: await Service.getTempToPermSettings() }),
  "Temp_to_perm_settings_fetched_successfully",
);

module.exports = {
  getEligibleWorkers,
  requestHire,
  getHires,
  acceptHire: respondToHire("accept", "Permanent_hire_accepted_successfully"),
  rejectHire: respondToHire("reject", "Permanent_hire_rejected_successfully"),
  cancelHire,
  getTempToPermSettings,
};
