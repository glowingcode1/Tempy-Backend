const { Queue } = require("bullmq");
const { createNewRedisClient } = require("../../redis/redisConfig");

const bookingQueue = new Queue("bookingStatus", {
  connection: createNewRedisClient(),
});
const slotQueue = new Queue("slotStatus", {
  connection: createNewRedisClient(),
});


const scheduleSlotUpdate = async (bookingId, slotId, delay) => {


  await slotQueue.add(
    "updateSlot",
    { bookingId, slotId },
    {
      delay,
      jobId: `slot-${bookingId}-${slotId}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

};

const scheduleBookingExpiry = async (booking) => {
  const delay = new Date(booking.bookingEndDate).getTime() - Date.now();

  await bookingQueue.add(
    "expireBooking",
    { bookingId: booking._id.toString() },
    {
      delay,
      jobId: `booking-${booking._id}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

};

module.exports = { bookingQueue, scheduleBookingExpiry, scheduleSlotUpdate };
