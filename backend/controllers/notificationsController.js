const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const { NotificationExp } = require("../models/Notifications");
const { getFullImageUrl } = require("@helperUtils/imageHelper");

const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || null;
  const userId = req.user._id;
  const timezone = req.user.timezone || "UTC";

  try {
    const query = { receiverId: userId };
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

    const formatted = notifications.map(n => {
      return {
        _id: n._id,
        type: n.type,
        objectId: n.objectId,
        objectType: n.objectType,
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
    const notification = await NotificationExp.findByIdAndUpdate(
      req.params.id,
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
