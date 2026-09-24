/*
 * Recomputes booking.payment for bookings made before calculatePayment
 * treated the bid as an hourly rate. Those stored the rate itself as the
 * shift's gross, so every earnings figure was one hour's pay at most.
 *
 * The rate comes from the approved bid and the hours from the booking's own
 * shift snapshot, so running it twice changes nothing the second time.
 *
 *   NODE_ENV=dev node backend/scripts/backfillBookingPayments.js          (dry run)
 *   NODE_ENV=dev node backend/scripts/backfillBookingPayments.js --apply
 */
require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });
require("module-alias/register");

const mongoose = require("mongoose");
const Booking = require("../roles/careHome/booking/Booking");
const Bid = require("../roles/aggency/bid/Bid");
const { calculatePayment } = require("../roles/careHome/booking/bookingService");

const APPLY = process.argv.includes("--apply");
const PLATFORM_FEE = Number(process.env.PLATFORM_FEE);
const FIELDS = ["amount", "perHour", "totalHours", "platformFee", "totalAmount"];

const run = async () => {
  if (!Number.isFinite(PLATFORM_FEE)) {
    throw new Error("PLATFORM_FEE is not set");
  }

  await mongoose.connect(process.env.BASE_URL);

  const bookings = await Booking.find({})
    .select("bid shift payment status")
    .lean();
  const bids = await Bid.find({ _id: { $in: bookings.map((b) => b.bid) } })
    .select("bid")
    .lean();
  const rateByBid = new Map(bids.map((b) => [String(b._id), b.bid]));

  const updates = [];
  let missingBid = 0;

  for (const booking of bookings) {
    const rate = rateByBid.get(String(booking.bid));

    if (rate === undefined || !booking.shift?.startTime) {
      missingBid += 1;
      continue;
    }

    const payment = calculatePayment(
      booking.shift.startTime,
      booking.shift.endTime,
      rate,
      booking.shift.breakMin,
      PLATFORM_FEE,
    );

    const changed = FIELDS.some((f) => booking.payment?.[f] !== payment[f]);
    if (!changed) continue;

    updates.push({
      updateOne: {
        filter: { _id: booking._id },
        update: {
          $set: Object.fromEntries(
            FIELDS.map((f) => [`payment.${f}`, payment[f]]),
          ),
        },
      },
    });

    console.log(
      String(booking._id),
      booking.status.padEnd(18),
      `amount ${booking.payment?.amount} -> ${payment.amount}`,
      `| net ${booking.payment?.totalAmount} -> ${payment.totalAmount}`,
    );
  }

  console.log(
    `\n${bookings.length} bookings, ${updates.length} to fix,`,
    `${missingBid} skipped (bid or shift missing).`,
  );

  if (APPLY && updates.length) {
    const result = await Booking.bulkWrite(updates);
    console.log(`Updated ${result.modifiedCount}.`);
  } else if (!APPLY) {
    console.log("Dry run. Pass --apply to write.");
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
