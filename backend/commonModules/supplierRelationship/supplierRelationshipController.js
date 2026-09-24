const { parsePaginationParams } = require("@helperUtils/responseUtil");
const sendServiceResult = require("@helperUtils/sendServiceResult");
const { isValidObjectId } = require("mongoose");
const Service = require("./supplierRelationshipService");
const { notifyContract } = require("./contractNotifications");

// Runs the handler, then notifies the other side if it succeeded.
const withNotification = (action, handler) => async (req) => {
  const result = await handler(req);
  if (result?.data) notifyContract(action, result.data, req.user);
  return result;
};

const requireFields = (body, fields) => fields.find((field) => !body?.[field]);

const uploadContract = sendServiceResult(
  withNotification("uploaded", async (req) => {
    const { customer, document } = req.body;
    if (
      requireFields(req.body, ["customer", "document"]) ||
      !isValidObjectId(customer)
    ) {
      return { error: "customer_and_document_required" };
    }
    return Service.uploadContract({
      supplier: req.user._id,
      customer,
      document,
    });
  }),
  "Contract_uploaded_successfully",
  201,
);

const signContract = sendServiceResult(
  withNotification("signed", async (req) => {
    if (!req.body?.signature) return { error: "signature_required" };
    return Service.signContract({
      id: req.params.id,
      customer: req.user._id,
      signature: req.body.signature,
    });
  }),
  "Contract_signed_successfully",
);

const countersignContract = sendServiceResult(
  withNotification("countersigned", async (req) => {
    if (!req.body?.signature) return { error: "signature_required" };
    return Service.countersignContract({
      id: req.params.id,
      supplier: req.user._id,
      signature: req.body.signature,
      signedDocument: req.body.signedDocument,
    });
  }),
  "Contract_countersigned_successfully",
);

const getRelationships = sendServiceResult(async (req) => {
  const { page, limit } = parsePaginationParams(req);
  const { status, supplier, customer } = req.query;
  return Service.getRelationships({
    userId: req.user._id,
    userType: req.user.userType,
    status,
    supplier,
    customer,
    page,
    limit,
  });
}, "Contracts_fetched_successfully");

const getRelationship = sendServiceResult(
  async (req) =>
    Service.getRelationship({
      id: req.params.id,
      userId: req.user._id,
      userType: req.user.userType,
    }),
  "Contract_fetched_successfully",
);

module.exports = {
  uploadContract,
  signContract,
  countersignContract,
  getRelationships,
  getRelationship,
};
