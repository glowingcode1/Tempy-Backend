const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

const idOf = (party) => party?._id || party;

// What each action tells the other side. The supplier's actions go to the
// customer and the customer's go to the supplier.
const MESSAGES = {
  created: {
    to: "customer",
    type: NotificationTypes.AGREED_RATE_OFFERED,
    title: "New Rate Offer",
    body: (name, role) => `${name} sent you a rate offer for ${role}.`,
  },
  updated: {
    to: "customer",
    type: NotificationTypes.AGREED_RATE_UPDATED,
    title: "Rate Offer Updated",
    body: (name, role) => `${name} updated their rate offer for ${role}.`,
  },
  withdrawn: {
    to: "customer",
    type: NotificationTypes.AGREED_RATE_WITHDRAWN,
    title: "Rate Offer Withdrawn",
    body: (name, role) => `${name} withdrew their rate offer for ${role}.`,
  },
  accept: {
    to: "supplier",
    type: NotificationTypes.AGREED_RATE_ACCEPTED,
    title: "Rate Offer Accepted",
    body: (name, role) => `${name} accepted your rate offer for ${role}.`,
  },
  reject: {
    to: "supplier",
    type: NotificationTypes.AGREED_RATE_REJECTED,
    title: "Rate Offer Rejected",
    body: (name, role) => `${name} rejected your rate offer for ${role}.`,
  },
  review: {
    to: "supplier",
    type: NotificationTypes.AGREED_RATE_REVIEW_REQUESTED,
    title: "Rate Review Requested",
    body: (name, role) =>
      `${name} asked you to review your rate offer for ${role}.`,
  },
};

// `rate` is the formatted rate the service returned; `actor` is req.user.
const notifyAgreedRate = (action, rate, actor) => {
  const message = MESSAGES[action];
  if (!message || !rate) return;

  void sendUserNotifications({
    recipientIds: [idOf(rate[message.to])],
    title: message.title,
    body: message.body(
      actor.name || "Someone",
      rate.jobType?.title || "a role",
    ),
    data: {
      type: message.type,
      objectType: "AgreedRate",
      status: rate.status,
    },
    sender: actor._id,
    objectId: rate._id,
  });
};

module.exports = { notifyAgreedRate };
