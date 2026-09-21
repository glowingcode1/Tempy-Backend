const cron = require("node-cron");
const { acquireLock, releaseLock } = require("@redisCache");

const autoCheckoutShifts = require("./booking/autoCheckoutShifts");

/*
 * Kept out of ./index.js for the same reason as ./awardRelease: requiring
 * index.js throws, so the server starts this directly. The Redis lock keeps
 * it to one run per tick across PM2 instances.
 */

// One registration per process, however many times this is called.
let scheduled = false;

const startAutoCheckoutCron = () => {
  if (scheduled) return;

  scheduled = true;

  /*
   * Every 5 minutes. The grace period is measured per shift, so the interval
   * only decides how promptly a forgotten check-out is noticed — and a worker
   * heading into a back-to-back shift does not wait for it, because their
   * check-in closes the lapsed shift itself.
   */
  cron.schedule("*/5 * * * *", async () => {
    const lockKey = "cron:auto-checkout-shifts";
    const lock = await acquireLock(lockKey, 120);

    if (!lock) return;

    try {
      const result = await autoCheckoutShifts();

      if (result.closed) {
        console.log(
          "🕑 Shifts auto checked out: " +
            result.closed +
            " (of " +
            result.checked +
            " checked)",
        );
      }
    } catch (err) {
      console.error("❌ Auto checkout cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });
};

module.exports = { startAutoCheckoutCron };
