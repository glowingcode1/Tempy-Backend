// services/userService.js
const {
  generateMeta,
  sendResponse,
} = require("../../../helperUtils/responseUtil");
const userRepo = require("./usersRepository");
const { formatUserResponse } = require("../../../helperUtils/userResponseUtil");
const { userCache } = require("../../../config/nodeCache");
const { User } = require("../../../models/UserModel");
const { default: mongoose } = require("mongoose");
const {
  generate2FASecret,
  generateQRCode,
  verify2FAToken,
} = require("./twoFactorAuth");
const {
  buildKeywordQueryFromModels,
} = require("../../../helperUtils/dbUtils/queryUtil");
const { validatePhoneNumber } = require("../../../helperUtils/validationsUtil");
const {
  accountStatusEmailTemplate,
} = require("../../../helperUtils/emailTemplates");
const { sendEmailViaBrevo } = require("../../../helperUtils/emailUtil");
const { createOrSkipDevice } = require("../../../models/Devices");
const { formatAthletes } = require("./formator/formatAthletes");
const {
  REQUIRED_FIELDS_BY_USER_TYPE,
  isUserProfileComplete,
} = require("@helperUtils/completeDetailsUtil");
const { USER_MODEL_MAP } = require("@helperUtils/userModelMapUtil");

const APP_NAME = "CoachCritic App";
const getAllUsers = async ({ page, limit, keyword, status, userType }) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    "verificationStatus.email": "verified",
  };

  if (status) {
    matchStage["accountState.status"] = status;
  } else {
    matchStage["accountState.status"] = { $ne: "deleted" };
  }

  if (userType !== undefined) {
    matchStage["accountState.userType"] = userType;
  }

  if (keyword && keyword.trim() !== "") {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: User.schema }],
      keyword,
    );

    Object.assign(matchStage, keywordMatch);
  }

  const pipeline = [
    {
      $match: matchStage,
    },
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "objectUser",
        pipeline: [
          {
            $project: {
              rating: 1,
            },
          },
        ],
        as: "reviews",
      },
    },

    {
      $addFields: {
        averageRating: {
          $round: [
            {
              $ifNull: [{ $avg: "$reviews.rating" }, 0],
            },
            1,
          ],
        },
        totalReviews: {
          $size: "$reviews",
        },
      },
    },

    {
      $facet: {
        users: [
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              accountState: 1,
              profileIcon: 1,
              location: 1,
              createdAt: 1,
              averageRating: 1,
              totalReviews: 1,
            },
          },

          {
            $sort: {
              createdAt: -1,
            },
          },

          {
            $skip: skip,
          },

          {
            $limit: limit,
          },
        ],

        total: [
          {
            $count: "count",
          },
        ],

        pending: [
          {
            $match: {
              "accountState.status": "pending",
            },
          },
          {
            $count: "count",
          },
        ],

        active: [
          {
            $match: {
              "accountState.status": "active",
            },
          },
          {
            $count: "count",
          },
        ],

        rejected: [
          {
            $match: {
              "accountState.status": "rejected",
            },
          },
          {
            $count: "count",
          },
        ],

        suspended: [
          {
            $match: {
              "accountState.status": "suspended",
            },
          },
          {
            $count: "count",
          },
        ],
      },
    },
  ];

  const result = await User.aggregate(pipeline);

  const data = result[0] || {};

  const users = data.users || [];
  const totalFiltered = data.total?.[0]?.count || 0;

  const pending = data.pending?.[0]?.count || 0;
  const active = data.active?.[0]?.count || 0;
  const rejected = data.rejected?.[0]?.count || 0;
  const suspended = data.suspended?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  meta.usersCount = {
    pending,
    active,
    rejected,
    suspended,
  };

  return {
    users: formatAthletes(users),
    meta,
  };
};

const updateUser = async (req, res, options = {}) => {
  const { userId } = options;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("User not found");
    }

    const userType = user.accountState?.userType;

    // -----------------------------------------
    // Basic profile fields
    // -----------------------------------------

    const basicEditableFields = [
      "name",
      "summary",
      "location",
      "dob",
      "gender",
      "profileIcon",
      "timezone",
      "username",
      "companyName",
      "type",
      "registrationNumber",
      "validationDocument",
    ];

    basicEditableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user.set(field, req.body[field]);
      }
    });

    // -----------------------------------------
    // Role-specific / complete profile fields
    // -----------------------------------------

    const typeSpecificFields = REQUIRED_FIELDS_BY_USER_TYPE[userType] || [];

    const roleSpecificData = {};

    typeSpecificFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        roleSpecificData[field] = req.body[field];
      }
    });

    if (Object.keys(roleSpecificData).length > 0) {
      user.set(roleSpecificData, undefined, {
        strict: false,
      });
    }

    // -----------------------------------------
    // Phone
    // -----------------------------------------

    if (req.body.phoneNumber !== undefined) {
      const phoneNumber = req.body.phoneNumber;

      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number
      ) {
        return {
          errorCode: 400,
          message: "invalid_phone",
        };
      }

      const existingPhone = await User.findOne({
        _id: { $ne: userId },
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });

      if (existingPhone) {
        return {
          errorCode: 409,
          message: "phone_number_already",
        };
      }

      user.phoneNumber = phoneNumber;
      user.verificationStatus.phoneNumber = "pending";
    }

    // -----------------------------------------
    // Status
    // -----------------------------------------

    if (req.body.status !== undefined) {
      user.accountState.status = req.body.status;
    }

    // -----------------------------------------
    // Blue tick
    // -----------------------------------------

    if (req.body.blueTick !== undefined) {
      const blueTick = req.body.blueTick;

      if (!user.accountState.blueTick) {
        user.accountState.blueTick = {};
      }

      if (blueTick.isActive !== undefined) {
        user.accountState.blueTick.isActive = blueTick.isActive;
      }

      if (blueTick.grantedAt !== undefined) {
        user.accountState.blueTick.grantedAt = blueTick.grantedAt;
      }

      user.markModified("accountState.blueTick");
    }

    // -----------------------------------------
    // Notifications
    // -----------------------------------------

    if (req.body.notifications && typeof req.body.notifications === "object") {
      const allowedKeys = [
        "email",
        "push",
        "bookingReminders",
        "profileviews",
        "messages",
      ];

      allowedKeys.forEach((key) => {
        if (req.body.notifications[key] !== undefined) {
          user.notifications[key] = req.body.notifications[key];
        }
      });
    }

    // -----------------------------------------
    // Save
    // -----------------------------------------

    await user.save({ session });

    await session.commitTransaction();

    userCache.del(userId.toString());

    return formatUserResponse(user.toJSON(), null, [], ["resetToken"]);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteUser = async (id) => {
  const updated = await userRepo.findByIdAndUpdate(id, {
    "accountState.status": "deleted",
  });
  if (!updated) return null;
  userCache.del(id.toString());
  return true;
};

const getUserDetails = async (id) => {
  return await userRepo.findUserById(id);
};

const getUserDetailsForQRService = async (id) => {
  let data = await userRepo.getUserDetailsForQRRepo(id);
  // let formattedData = data?.toObject?.() ?? data;
  // formattedData = ;
  return formatUserResponse(
    data,
    null,
    [],
    ["accountState", "preferences", "metadata"],
  );
};

/**
 * Setup 2FA (Generate QR and Secret, but do not enable yet)
 * @param {string} userId
 * @returns {Promise<{ qrCodeDataURL: string, secret: string }>}
 */
const setupTwoFA = async (userId) => {
  const user = await userRepo.findUserById(userId, { twoFA: 1, email: 1 });

  let secret = user.twoFA?.secret;
  if (!secret) {
    const { secret: newSecret } = generate2FASecret(APP_NAME, user.email);
    secret = newSecret;

    await userRepo.updateTwoFA(userId, {
      "twoFA.secret": secret,
      "twoFA.isEnabled": false,
      "twoFA.isConfirmed": false,
    });
  }

  const otpauth = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(APP_NAME)}`;
  const qrCodeDataURL = await generateQRCode(otpauth);

  return { qrCodeDataURL, secret };
};

/**
 * Confirm 2FA (Verify token and enable)
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const confirmTwoFA = async (userId, token) => {
  const user = await userRepo.findUserById(userId, { twoFA: 1 });

  if (!user || !user.twoFA?.secret) {
    return { isValid: false, newlyEnabled: false };
  }

  const isValid = verify2FAToken(token, user.twoFA.secret);

  if (!isValid) {
    return { isValid: false, newlyEnabled: false };
  }

  const updatePayload = {
    "twoFA.isEnabled": true,
    "twoFA.isConfirmed": true,
    "twoFA.enabledAt": new Date(),
  };

  await userRepo.updateTwoFA(userId, updatePayload);

  userCache.del(userId.toString());

  return {
    isValid: true,
    newlyEnabled: !user.twoFA.isEnabled,
  };
};

/**
 * Disable 2FA
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const disableTwoFA = async (userId) => {
  await userRepo.updateTwoFA(userId, {
    "twoFA.isEnabled": false,
    "twoFA.isConfirmed": false,
  });
  return true;
};

const getAllAthletes = async ({
  page,
  limit,
  keyword,
  status,
  userType = "user",
}) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    "verificationStatus.email": "verified",
  };

  if (status) {
    matchStage["accountState.status"] = status;
  } else {
    matchStage["accountState.status"] = { $ne: "deleted" };
  }

  if (userType !== undefined) {
    matchStage["accountState.userType"] = userType;
  }

  if (keyword && keyword.trim() !== "") {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: User.schema }],
      keyword,
    );

    Object.assign(matchStage, keywordMatch);
  }

  const pipeline = [
    {
      $match: matchStage,
    },

    {
      $lookup: {
        from: "bookings",
        localField: "_id",
        foreignField: "user",
        pipeline: [
          {
            $match: {
              bookingStatus: {
                $nin: ["deleted", "cancelled", "rejected"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              bookingStatus: 1,
            },
          },
        ],
        as: "sessions",
      },
    },

    {
      $addFields: {
        totalSessions: {
          $size: "$sessions",
        },
      },
    },

    {
      $facet: {
        users: [
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              profileIcon: 1,
              accountState: 1,
              phoneNumber: 1,
              accountState: 1,
              createdAt: 1,
              totalSessions: 1,
            },
          },

          {
            $sort: {
              createdAt: -1,
            },
          },

          {
            $skip: skip,
          },

          {
            $limit: limit,
          },
        ],

        total: [
          {
            $count: "count",
          },
        ],
      },
    },
  ];

  const result = await User.aggregate(pipeline);

  const data = result[0] || {};

  const users = data.users || [];
  const totalFiltered = data.total?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  return {
    users: formatAthletes(users),
    meta,
  };
};

const getUsersByType = async ({ page, limit, userType }) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    "verificationStatus.email": "verified",
    "accountState.status": { $ne: "deleted" },
  };

  if (userType) {
    matchStage["accountState.userType"] = userType;
  }

  const [users, total] = await Promise.all([
    User.find(matchStage)
      .select("_id name email profileIcon location accountState createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    User.countDocuments(matchStage),
  ]);

  return {
    users,
    meta: generateMeta(page, limit, total),
  };
};

module.exports = {
  getAllUsers,
  updateUser,
  deleteUser,
  getUserDetails,
  setupTwoFA,
  confirmTwoFA,
  disableTwoFA,
  getUserDetailsForQRService,
  getAllAthletes,
  getUsersByType,
};
