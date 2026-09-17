const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const {
  NotificationExp,
  NotificationTypes,
} = require("../models/Notifications");
const Booking = require("../roles/careHome/booking/Booking");
const { getFullImageUrl } = require("@helperUtils/imageHelper");
const {
  emitNotificationReadToUser,
} = require("../config/sockets/notificationSocketEmitter");

const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || null;
  const userId = req.user._id;
  const timezone = req.user.timezone || "UTC";

  try {
    const query = { receiverId: userId, isDeleted: { $ne: true } };
    if (keyword) query.type = { $regex: keyword, $options: "i" };

    const [notifications, total] = await Promise.all([
      NotificationExp.find(query)
        .select(
          "_id type objectId objectType title body isRead subjectId image createdAt"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationExp.countDocuments(query),
    ]);

    if (!notifications.length) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "notifications_fetched_success",
        data: [],
        meta: generateMeta(page, limit, total),
      });
    }

    /*
     * A job offer (job_assigned) is answered from the notification itself, so
     * the app needs the booking's current state: once the worker has answered,
     * or the supplier has withdrawn it, the Accept / Reject buttons must go.
     */
    const bookingIds = notifications
      .filter((n) => n.objectType === "Booking" && n.objectId)
      .map((n) => n.objectId);

    const bookings = bookingIds.length
      ? await Booking.find({ _id: { $in: bookingIds } })
          .select("_id status worker")
          .lean()
      : [];
    const bookingById = new Map(bookings.map((b) => [String(b._id), b]));

    const formatted = notifications.map(n => {
      const booking =
        n.objectType === "Booking" ? bookingById.get(String(n.objectId)) : null;

      return {
        _id: n._id,
        type: n.type,
        objectId: n.objectId,
        objectType: n.objectType,
        objectStatus: booking?.status || null,
        canRespond: Boolean(
          booking &&
            n.type === NotificationTypes.JOB_ASSIGNED &&
            booking.status === "pending" &&
            String(booking.worker) === String(userId),
        ),
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        subjectId: n.subjectId,

        image: getFullImageUrl(n.image),
        timeSince: moment(n.createdAt).tz(timezone).fromNow(),
        createdAt: n.createdAt,
      };
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notifications_fetched_success",
      data: formatted,
      meta: generateMeta(page, limit, total),
    });

  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "notifications_fetch_error",
      error,
    });
  }
};




// Mark a notification as read by ID
const readNotification = async (req, res) => {
  try {
    // Only the receiver may mark their own notification as read.
    const notification = await NotificationExp.findOneAndUpdate(
      { _id: req.params.id, receiverId: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "notification_not_found", // Use translation key
      });
    }

    // Keep the receiver's other devices in sync so the unread badge clears
    // instantly. Emitting must never fail the request.
    try {
      emitNotificationReadToUser({
        ioOrNamespace: req.io || global.io,
        recipientId: notification.receiverId,
        notificationId: notification._id,
      });
    } catch (emitError) {
      console.error("Failed to emit readNotification:", emitError);
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notification_marked_read_success", // Use translation key
      data: notification,
    });
  } catch (error) {

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "notification_mark_read_error", // Use translation key
      error,
    });
  }
};

module.exports = {
  getNotifications,
  readNotification,
};
