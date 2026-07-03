const cron = require("node-cron");
const { acquireLock, releaseLock } = require("@redisCache");

const { flushEngagementBuffer } = require("./engagement/flushEngagementBuffer");
const updateBookingStatuses = require("./booking/updateBooking");

const startCrons = () => {
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 */1 * * *", async () => {
    //every 1 hour
    const lockKey = "cron:engagement-buffer-flush";
    const lock = await acquireLock(lockKey, 120);

    if (!lock) return;

    try {
      await flushEngagementBuffer();
    } catch (err) {
      console.error("❌ Engagement flush cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });

  //booking

  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  // cron.schedule("0 */1 * * *", async () => {
    cron.schedule("*/10 * * * *", async () => {
      //every 10 minutes
      //every 1 hour
      const lockKey = "cron:booking-status-update";
      const lock = await acquireLock(lockKey, 120);

      if (!lock) return;

      try {
        await updateBookingStatuses();
      } catch (err) {
        console.error("❌ Booking status update cron failed:", err);
      } finally {
        await releaseLock(lockKey, lock);
      }
    });
};

module.exports = { startCrons };
