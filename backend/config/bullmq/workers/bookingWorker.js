const { Worker } = require("bullmq");
const { createNewRedisClient } = require("../../redis/redisConfig");
const { Bookings } = require("../.././../roles/user/bookings/BookingsModel");

const slotWorker = new Worker(
  "slotStatus",

  async (job) => {
    const { bookingId, slotId } = job.data;

    const booking = await Bookings.findById(bookingId);

    if (!booking) return;

    let updated = false;

    for (const weekly of booking.weeklySlots || []) {
      for (const slot of weekly.slots || []) {
        if (slot._id.toString() === slotId) {
          if (slot.status === "ongoing") {
            slot.status = "completed";
          } else {
            slot.status = "expired";
          }

          updated = true;
        }
      }
    }

    if (!updated) return;

    await booking.save();

    console.log(`✅ Slot updated → ${slotId}`);
  },

  { connection: createNewRedisClient() },
);

slotWorker.on("ready", () => console.log("👷 Slot worker is listening"));

slotWorker.on("failed", (job, err) =>
  console.error(`❌ Slot job ${job?.id} failed:`, err.message),
);

const bookingWorker = new Worker(
  "bookingStatus",
  async (job) => {
    const { bookingId } = job.data;

    const booking = await Bookings.findById(bookingId);
    if (!booking) return;
    if (
      booking.bookingStatus === "completed" ||
      booking.bookingStatus === "expired"
    ) {
      console.log(`⚠️ Booking ${bookingId} already ${booking.bookingStatus}`);
      return;
    }

    if (booking.bookingStatus === "ongoing") {
      booking.bookingStatus = "completed";
    } else {
      booking.bookingStatus = "expired";
    }

    await booking.save();

    console.log(`✅ Booking ${bookingId} → ${booking.bookingStatus}`);
  },
  { connection: createNewRedisClient() },
);

bookingWorker.on("ready", () => console.log("👷 Booking worker is listening"));

bookingWorker.on("failed", (job, err) =>
  console.error(`❌ Job ${job?.id} failed:`, err.message),
);

module.exports = { bookingWorker, slotWorker };
