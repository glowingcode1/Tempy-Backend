const cron = require("node-cron");
const { acquireLock, releaseLock } = require("@redisCache");

const releaseUnstaffedAwards = require("./booking/releaseUnstaffedAwards");

/*
 * This lives outside ./index.js on purpose. index.js also requires
 * ./booking/updateBooking, which requires roles/user/bookings/BookingsModel -
 * a model that no longer exists - so requiring index.js throws. That is why
 * startCrons() is commented out in server.js. Keeping the award sweep in its
 * own module lets the server start it without pulling in that broken import.
 *
 * PM2 runs the app in cluster mode with instances: "max", so every worker
 * registers this cron. The Redis lock is what keeps it to one run per tick.
 * It is fail-safe rather than fail-open: with Redis down no instance wins the
 * lock and the sweep waits for the next tick instead of running N times.
 */

// One registration per process, however many times this is called.
let scheduled = false;

const startAwardReleaseCron = () => {
  if (scheduled) return;

  scheduled = true;

  /*
   * Every 10 minutes. The grace period is measured per award, so the interval
   * only decides how promptly an expired one is noticed.
   */
  cron.schedule("*/10 * * * *", async () => {
    const lockKey = "cron:release-unstaffed-awards";
    const lock = await acquireLock(lockKey, 120);

    if (!lock) return;

    try {
      const result = await releaseUnstaffedAwards();

      if (result.reopened || result.closed) {
        console.log(
          "🔁 Unstaffed awards released: " +
            result.reopened +
            " reopened, " +
            result.closed +
            " closed (of " +
            result.checked +
            " checked)",
        );
      }
    } catch (err) {
      console.error("❌ Unstaffed award release cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });
};

module.exports = { startAwardReleaseCron };
