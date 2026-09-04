// config/sockets/notificationSocketEmitter.js
const {
  getChatNamespace,
} = require("../../commonModules/chatModule/sockets/chatEventEmitter");
const {
  getUserRoom,
} = require("../../commonModules/chatModule/sockets/chatSocketRooms");

// Notifications are delivered over the same "/chat" namespace the apps are
// already connected to — that is the only namespace where every user joins a
// personal room (user:<id>), so it reaches all of that user's devices.
function emitNotificationEvent({
  ioOrNamespace,
  recipientId,
  event,
  payload,
}) {
  if (!recipientId) return;

  const chatNamespace = getChatNamespace(ioOrNamespace || global.io);
  if (!chatNamespace) return;

  chatNamespace.to(getUserRoom(recipientId)).emit(event, payload);
}

function emitNotificationDeletedToUser({
  ioOrNamespace,
  recipientId,
  notificationId,
}) {
  emitNotificationEvent({
    ioOrNamespace,
    recipientId,
    event: "deleteNotification",
    payload: { notificationId: String(notificationId) },
  });
}

function emitNotificationReadToUser({
  ioOrNamespace,
  recipientId,
  notificationId,
}) {
  emitNotificationEvent({
    ioOrNamespace,
    recipientId,
    event: "readNotification",
    payload: { notificationId: String(notificationId) },
  });
}

module.exports = {
  emitNotificationDeletedToUser,
  emitNotificationReadToUser,
};
