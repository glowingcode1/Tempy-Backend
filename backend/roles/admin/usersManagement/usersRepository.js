// repositories/userRepository.js

const { User } = require("@UsersModel");
const mongoose = require("mongoose");
// Create
const createUser = async (data) => {
  const user = new User(data);
  return await user.save();
};

// Get all with filters
const getUsersWithFilters = async (query, skip, limit) => {
  const users = await User.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    ...(limit > 0 ? [{ $limit: limit }] : []),
  ]);

  return users;
};

// Count by condition
const countUsers = async (query = {}) => {
  return User.countDocuments(query);
};

// Find by ID with optional projection and populate suppliers and category
const findUserById = async (id, projection = null) => {
  // Prepare projection object if needed
  const proj = projection ? projection : {};

  // Find user and populate suppliers and category in companyDetails
  return User.findById(id, proj);
};

const getUserDetailsForQRRepo = async (id) => {
  return User.findById(id).select("profileIcon name email phoneNumber accountState");
};

// Update and save
const updateUserData = async (user, data) => {
  Object.assign(user, data);
  return await user.save();
};

// Delete
const deleteUserById = async (user) => {
  return await user.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return User.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Update user's 2FA secret and status
 */
const updateTwoFA = async (userId, data) => {
  return User.findByIdAndUpdate(
    userId,
    { $set: data },
    {
      new: true,
      runValidators: true,
    },
  );
};
const findUserByStaff = async (staffIds = [], projection = null) => {
  if (!staffIds.length) return [];

  const ids = staffIds.map((id) => new mongoose.Types.ObjectId(id));

  const defaultProjection = {
    name: 1,
    profileIcon: 1,
    location: 1,
    weeklyHours: 1,
  };

  const proj = projection || defaultProjection;

  return User.find({ _id: { $in: ids } }, proj).lean();
};

module.exports = {
  createUser,
  getUsersWithFilters,
  countUsers,
  findUserById,
  updateUserData,
  deleteUserById,
  findByIdAndUpdate,
  updateTwoFA,
  getUserDetailsForQRRepo,
  findUserByStaff,
};
