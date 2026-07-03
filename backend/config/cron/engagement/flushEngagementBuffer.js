const { popBufferBatch } = require("@redisCache");
const EngagementEvents = require("@EngagementEventsModel");
const { logger } = require("../../logging");

const BATCH_SIZE = 2000;

const flushEngagementBuffer = async () => {
  let totalInserted = 0;
  let totalSkippedDuplicates = 0;

  while (true) {
    const batch = await popBufferBatch("engagement", BATCH_SIZE);

    if (!batch.length) break;

    //remove duplicates that might have been added due to retries
    const uniqueBatch = Array.from(new Set(batch.map(JSON.stringify))).map(JSON.parse);

    try {
      const insertResult = await EngagementEvents.insertMany(uniqueBatch, {
        ordered: false
      });

      totalInserted += insertResult.length;
    } catch (error) {
      const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : [];
      const duplicateErrors = writeErrors.filter(
        (writeError) => writeError?.code === 11000
      );

      if (duplicateErrors.length === writeErrors.length && duplicateErrors.length > 0) {
        const inserted = uniqueBatch.length - duplicateErrors.length;
        totalInserted += Math.max(inserted, 0);
        totalSkippedDuplicates += duplicateErrors.length;
      } else {
        throw error;
      }
    }

    // Safety stop to prevent runaway jobs
    if (totalInserted > 50000) break;
  }

  if (totalInserted > 0) {
    console.log(`📊 Flushed ${totalInserted} engagement events`);
  }

  if (totalSkippedDuplicates > 0) {
    logger.info(`Engagement flush skipped ${totalSkippedDuplicates} duplicate events`);
  }
};

module.exports = { flushEngagementBuffer };