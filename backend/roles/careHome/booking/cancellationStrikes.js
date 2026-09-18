const { User } = require("@UsersModel");
const { userCache } = require("../../../config/nodeCache");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { accountStatusEmailTemplate } = require("@helperUtils/emailTemplates");
const { sendEmailViaBrevo } = require("@helperUtils/emailUtil");
const { runInBackground } = require("@helperUtils/runInBackground");
const { shiftStartsAt } = require("../job/jobRepository");

/*
 * Tempy's three strikes rule: a supplier that cancels an accepted booking
 * with less than 24 hours' notice gets a strike, and the third suspends the
 * account. Only an admin can make it active again (which clears the strikes,
 * see usersService.updateUser).
 */
const STRIKE_NOTICE_HOURS = 24;
const STRIKE_LIMIT = 3;
const SUSPENSION_REASON = "late_cancellation_strikes";

const isLateCancellation = (shift, now = new Date()) => {
  const startsAt = shiftStartsAt(shift);
  return (
    Boolean(startsAt) &&
    startsAt.getTime() - now.getTime() < STRIKE_NOTICE_HOURS * 60 * 60 * 1000
  );
};

const activeStrikeCount = (user) =>
  (user?.cancellationStrikes || []).filter((strike) => !strike.cleared).length;

/*
 * Records a strike against `supplierId` for cancelling `booking`, if it was
 * late. Returns { strikes, suspended } when a strike was added, else null.
 */
const recordLateCancellation = async (supplierId, booking, now = new Date()) => {
  if (!supplierId || !isLateCancellation(booking.shift, now)) return null;

  // The $ne guard makes a repeated call for the same booking a no-op.
  const user = await User.findOneAndUpdate(
    { _id: supplierId, "cancellationStrikes.booking": { $ne: booking._id } },
    {
      $push: {
        cancellationStrikes: {
          booking: booking._id,
          shiftStartsAt: shiftStartsAt(booking.shift),
          cancelledAt: now,
        },
      },
    },
    { new: true, projection: "name email accountState cancellationStrikes" },
  ).lean();

  if (!user) return null;

  const strikes = activeStrikeCount(user);
  const suspended =
    strikes >= STRIKE_LIMIT && user.accountState?.status !== "suspended";

  if (suspended) {
    await User.updateOne(
      { _id: supplierId },
      {
        "accountState.status": "suspended",
        "accountState.reason": SUSPENSION_REASON,
      },
    );
    // authMiddleware caches users for an hour; drop it so the suspension
    // applies to this user's next request.
    userCache.del(String(supplierId));

    if (user.email) {
      runInBackground(
        sendEmailViaBrevo(
          [user.email],
          "Your Tempy account has been suspended",
          accountStatusEmailTemplate("suspended", user.name || ""),
        ),
        "suspension email for " + supplierId,
      );
    }
  }

  void sendUserNotifications({
    recipientIds: [supplierId],
    title: suspended ? "Account suspended" : "Late cancellation strike",
    body: suspended
      ? `You have cancelled ${STRIKE_LIMIT} shifts with less than ${STRIKE_NOTICE_HOURS} hours' notice, so your account has been suspended. Please contact Tempy support.`
      : `You cancelled a shift with less than ${STRIKE_NOTICE_HOURS} hours' notice. This is strike ${strikes} of ${STRIKE_LIMIT}; at ${STRIKE_LIMIT} your account will be suspended.`,
    data: {
      type: NotificationTypes.CANCELLATION_STRIKE,
      objectType: "Booking",
      bookingId: String(booking._id),
    },
    objectId: booking._id,
    meta: { strikes, limit: STRIKE_LIMIT, suspended },
    saveNotification: true,
  });

  return { strikes, limit: STRIKE_LIMIT, suspended };
};

module.exports = {
  STRIKE_NOTICE_HOURS,
  STRIKE_LIMIT,
  SUSPENSION_REASON,
  isLateCancellation,
  activeStrikeCount,
  recordLateCancellation,
};
