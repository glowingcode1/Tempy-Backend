const Job = require("../../../roles/careHome/job/Job");
const { shiftStartsAt } = require("../../../roles/careHome/job/jobRepository");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

/*
 * Job owners can ask to be alerted a set time before each shift of a job
 * starts (Job.alert). Until SMS is available the alert goes out as a push /
 * in-app notification to the job owner; alert.phoneNumber is stored for when
 * it is.
 *
 * A shift is due once its alert time has passed and it has not started yet,
 * so a late run (or an alert saved after that point) still fires before the
 * shift. Each shift start is alerted once, recorded in alert.sent.
 */

const MAX_LEAD_HOURS = 168; // matches the API's cap on hoursBefore
const HOUR_MS = 60 * 60 * 1000;

const formatLead = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
};

const alreadySent = (alert, shiftId, startsAt) =>
  (alert.sent || []).some(
    (entry) =>
      String(entry.shift) === String(shiftId) &&
      new Date(entry.startsAt).getTime() === startsAt.getTime(),
  );

const sendShiftAlerts = async (now = new Date()) => {
  const jobs = await Job.find({
    status: "active",
    "alert.enabled": true,
    // only jobs with a shift that could still be inside its alert window
    shift: {
      $elemMatch: {
        date: {
          $gte: new Date(now.getTime() - 24 * HOUR_MS),
          $lte: new Date(now.getTime() + (MAX_LEAD_HOURS + 24) * HOUR_MS),
        },
        status: { $ne: "completed" },
      },
    },
  })
    .select("user name alert shift")
    .lean();

  let sent = 0;

  for (const job of jobs) {
    const leadMinutes =
      (job.alert.hoursBefore || 0) * 60 + (job.alert.minutesBefore || 0);
    if (leadMinutes <= 0) continue;

    const due = (job.shift || []).filter((shift) => {
      if (shift.status === "completed") return false;
      const startsAt = shiftStartsAt(shift);
      if (!startsAt || startsAt <= now) return false;

      const alertAt = new Date(startsAt.getTime() - leadMinutes * 60000);
      return alertAt <= now && !alreadySent(job.alert, shift._id, startsAt);
    });

    if (!due.length) continue;

    // Record first: a failed push must not turn into repeated alerts.
    const entries = due.map((shift) => ({
      shift: shift._id,
      startsAt: shiftStartsAt(shift),
    }));
    await Job.updateOne(
      { _id: job._id },
      { $push: { "alert.sent": { $each: entries } } },
    );

    for (const shift of due) {
      const minutesLeft = Math.max(
        1,
        Math.round((shiftStartsAt(shift).getTime() - now.getTime()) / 60000),
      );

      await sendUserNotifications({
        recipientIds: [job.user],
        title: "Shift starting soon",
        body: `A shift for "${job.name || "your job"}" starts in ${formatLead(minutesLeft)}.`,
        data: {
          type: NotificationTypes.SHIFT_ALERT,
          objectType: "Job",
          jobId: String(job._id),
          shiftId: String(shift._id),
        },
        objectId: job._id,
        meta: {
          jobId: job._id,
          shiftId: shift._id,
          startsAt: shiftStartsAt(shift),
        },
        saveNotification: true,
      });
      sent += 1;
    }
  }

  return { checked: jobs.length, sent };
};

module.exports = sendShiftAlerts;
