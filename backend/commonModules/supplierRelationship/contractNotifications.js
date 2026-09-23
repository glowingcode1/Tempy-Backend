const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

const idOf = (party) => party?._id || party;

// Each signing step tells the side that has to act (or read) next.
const MESSAGES = {
  uploaded: {
    to: "customer",
    type: NotificationTypes.CONTRACT_UPLOADED,
    title: "Contract To Sign",
    body: (name) =>
      `${name} sent you their contract. Please sign it before your first shift together.`,
  },
  signed: {
    to: "supplier",
    type: NotificationTypes.CONTRACT_SIGNED,
    title: "Contract Signed",
    body: (name) => `${name} signed your contract. Please countersign it.`,
  },
  countersigned: {
    to: "customer",
    type: NotificationTypes.CONTRACT_COUNTERSIGNED,
    title: "Contract Complete",
    body: (name) =>
      `${name} countersigned the contract. It is now signed by both sides.`,
  },
};

// `relationship` is what the service returned; `actor` is req.user.
const notifyContract = (action, relationship, actor) => {
  const message = MESSAGES[action];
  if (!message || !relationship) return;

  void sendUserNotifications({
    recipientIds: [idOf(relationship[message.to])],
    title: message.title,
    body: message.body(actor.name || "Someone"),
    data: {
      type: message.type,
      objectType: "SupplierRelationship",
      status: relationship.contract?.status,
    },
    sender: actor._id,
    objectId: relationship._id,
  });
};

module.exports = { notifyContract };
