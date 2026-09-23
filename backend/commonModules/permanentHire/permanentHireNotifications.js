const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { User } = require("@UsersModel");

const send = ({ to, type, title, body, hire, actor }) =>
  sendUserNotifications({
    recipientIds: [to],
    title,
    body,
    data: { type, objectType: "PermanentHire", status: hire.status },
    sender: actor._id,
    objectId: hire._id,
  });

// Names of everyone on the hire, keyed by id.
const loadNames = async (hire) => {
  const users = await User.find(
    { _id: { $in: [hire.customer, hire.supplier, hire.worker] } },
    "name",
  ).lean();
  return (id) =>
    users.find((user) => String(user._id) === String(id))?.name || "Someone";
};

/*
 * `hire` is what the service returned; `actor` is req.user. Runs in the
 * background: a failed notification must never fail the request.
 */
const notifyPermanentHire = async (action, hire, actor) => {
  try {
    if (!hire) return;

    const nameOf = await loadNames(hire);
    const careHome = nameOf(hire.customer);
    const isNurse = hire.supplierType === "nurse";
    // How the supplier reads about the worker: a solo nurse is the worker.
    const workerForSupplier = isNurse ? "you" : nameOf(hire.worker);
    const workerForCareHome = nameOf(hire.worker);

    if (action === "requested") {
      send({
        to: hire.supplier,
        type: NotificationTypes.PERMANENT_HIRE_REQUESTED,
        title: "Permanent Hire Request",
        body: `${careHome} wants to hire ${workerForSupplier} permanently.`,
        hire,
        actor,
      });
    }

    if (action === "cancelled") {
      send({
        to: hire.supplier,
        type: NotificationTypes.PERMANENT_HIRE_CANCELLED,
        title: "Permanent Hire Cancelled",
        body: `${careHome} cancelled their request to hire ${workerForSupplier} permanently.`,
        hire,
        actor,
      });
    }

    if (action === "reject") {
      send({
        to: hire.customer,
        type: NotificationTypes.PERMANENT_HIRE_REJECTED,
        title: "Permanent Hire Rejected",
        body: `${nameOf(hire.supplier)} rejected your request to hire ${workerForCareHome} permanently.`,
        hire,
        actor,
      });
    }

    if (action === "accept") {
      send({
        to: hire.customer,
        type: NotificationTypes.PERMANENT_HIRE_ACCEPTED,
        title: "Permanent Hire Accepted",
        body: `${nameOf(hire.supplier)} accepted your request to hire ${workerForCareHome} permanently.`,
        hire,
        actor,
      });

      // An agency worker also hears about it, since they leave the agency.
      if (!isNurse) {
        send({
          to: hire.worker,
          type: NotificationTypes.PERMANENT_HIRE_ACCEPTED,
          title: "You Have Been Hired Permanently",
          body: `${careHome} has hired you permanently. You are no longer staff of ${nameOf(hire.supplier)}.`,
          hire,
          actor,
        });
      }
    }
  } catch (error) {
    console.error("Error sending permanent hire notification:", error);
  }
};

module.exports = { notifyPermanentHire };
