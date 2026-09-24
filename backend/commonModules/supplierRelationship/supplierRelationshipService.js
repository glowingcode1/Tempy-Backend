const mongoose = require("mongoose");
const SupplierRelationship = require("./SupplierRelationship");
const { User, customerTypes, supplierTypes } = require("@UsersModel");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  getFullFileUrl,
  withFullProfileIcon,
} = require("@helperUtils/imageHelper");

const PARTY_FIELDS = "name email profileIcon accountState.userType";

const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

// Signatures are left as they are: the signer may send a typed name rather
// than an uploaded file.
const CONTRACT_FILE_FIELDS = ["document", "signedDocument"];

// Full URLs for the contract files and both parties' profile pictures.
const format = (relationship) => {
  const obj = relationship?.toObject ? relationship.toObject() : relationship;
  if (!obj) return obj;

  const contract = { ...obj.contract };
  for (const field of CONTRACT_FILE_FIELDS) {
    contract[field] = getFullFileUrl(contract[field]);
  }

  return {
    ...obj,
    supplier: withFullProfileIcon(obj.supplier),
    customer: withFullProfileIcon(obj.customer),
    contract,
  };
};

const findRelationship = (supplier, customer) =>
  SupplierRelationship.findOne({ supplier, customer });

// True once both sides have signed the supplier's contract.
const hasSignedContract = async (supplier, customer) => {
  const relationship = await SupplierRelationship.exists({
    supplier,
    customer,
    "contract.status": "signed",
  });
  return Boolean(relationship);
};

// Supplier uploads (or replaces) its contract for a customer.
const uploadContract = async ({ supplier, customer, document }) => {
  const customerUser = await User.findById(customer, "accountState").lean();
  if (!customerTypes.includes(customerUser?.accountState?.userType)) {
    return { error: "Customer_not_found", statusCode: 404 };
  }

  let relationship = await findRelationship(supplier, customer);

  // A signed contract is final.
  if (relationship?.contract?.status === "signed") {
    return { error: "Contract_already_signed" };
  }

  if (!relationship) {
    relationship = new SupplierRelationship({ supplier, customer });
  }

  // A new upload starts the signing over.
  relationship.contract = { document, status: "awaitingCustomer" };
  await relationship.save();

  return { data: format(relationship) };
};

// Customer signs first.
const signContract = async ({ id, customer, signature }) => {
  const relationship = await SupplierRelationship.findById(id);
  if (!relationship || !sameId(relationship.customer, customer)) return null;

  if (relationship.contract.status !== "awaitingCustomer") {
    return { error: "Contract_not_awaiting_customer_signature" };
  }

  relationship.contract.customerSignature = signature;
  relationship.contract.customerSignedAt = new Date();
  relationship.contract.status = "awaitingSupplier";
  await relationship.save();

  return { data: format(relationship) };
};

// Supplier countersigns, which completes the contract.
const countersignContract = async ({
  id,
  supplier,
  signature,
  signedDocument,
}) => {
  const relationship = await SupplierRelationship.findById(id);
  if (!relationship || !sameId(relationship.supplier, supplier)) return null;

  if (relationship.contract.status !== "awaitingSupplier") {
    return { error: "Contract_not_awaiting_supplier_signature" };
  }

  relationship.contract.supplierSignature = signature;
  relationship.contract.supplierSignedAt = new Date();
  relationship.contract.signedDocument =
    signedDocument || relationship.contract.document;
  relationship.contract.status = "signed";
  await relationship.save();

  return { data: format(relationship) };
};

// Scopes a query to the side of the relationship the requester is on.
const partyFilter = ({ userId, userType }) => {
  if (supplierTypes.includes(userType)) {
    return { supplier: new mongoose.Types.ObjectId(userId) };
  }
  if (customerTypes.includes(userType)) {
    return { customer: new mongoose.Types.ObjectId(userId) };
  }
  return {}; // admin
};

const getRelationships = async ({
  userId,
  userType,
  status,
  supplier,
  customer,
  page,
  limit,
}) => {
  const filter = {
    ...(supplier && { supplier }),
    ...(customer && { customer }),
    ...(status && { "contract.status": status }),
    ...partyFilter({ userId, userType }),
  };

  const [data, total] = await Promise.all([
    SupplierRelationship.find(filter)
      .populate("supplier", PARTY_FIELDS)
      .populate("customer", PARTY_FIELDS)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupplierRelationship.countDocuments(filter),
  ]);

  return { data: data.map(format), meta: generateMeta(page, limit, total) };
};

const getRelationship = async ({ id, userId, userType }) => {
  const relationship = await SupplierRelationship.findOne({
    _id: id,
    ...partyFilter({ userId, userType }),
  })
    .populate("supplier", PARTY_FIELDS)
    .populate("customer", PARTY_FIELDS)
    .lean();

  return relationship ? { data: format(relationship) } : null;
};

module.exports = {
  hasSignedContract,
  uploadContract,
  signContract,
  countersignContract,
  getRelationships,
  getRelationship,
};
