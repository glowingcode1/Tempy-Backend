const cron = require("node-cron");
const { acquireLock, releaseLock } = require("@redisCache");

const sendShiftAlerts = require("./job/sendShiftAlerts");

/*
 * Kept out of ./index.js for the same reason as ./awardRelease: requiring
 * index.js throws, so the server starts this directly. The Redis lock keeps
 * it to one run per tick across PM2 instances.
 */

let scheduled = false;

const startShiftAlertCron = () => {
  if (scheduled) return;

  scheduled = true;

  // Every minute, so an alert lands close to the time the owner chose.
  cron.schedule("* * * * *", async () => {
    const lockKey = "cron:shift-alerts";
    const lock = await acquireLock(lockKey, 55);

    if (!lock) return;

    try {
      const result = await sendShiftAlerts();

      if (result.sent) {
        console.log(`🔔 Shift alerts sent: ${result.sent}`);
      }
    } catch (err) {
      console.error("❌ Shift alert cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });
};

module.exports = { startShiftAlertCron };
