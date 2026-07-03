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
const { findByIdAndUpdate } = require("../subAdmins/subAdminsRepository");

const APP_NAME = "CoachCritic App";

const USER_MODEL_MAP = {
    careHome: require("../../../models/CareHomesModel"),
    agency:   require("../../../models/AgencyModel"),
    user:     require("../../../models/UserModel").User,
    guest:    require("../../../models/UserModel").User,
    admin:    require("../../../models/UserModel").User,
};
const getAllUsers = async ({ page, limit, keyword, status, userType = "coach" }) => {
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
      $lookup: {
        from: "coachonboardingresponses", // or "usersonboardingresponses"
        localField: "_id",
        foreignField: "user",
        as: "coachOnboardingResponse",
      },
    },

    {
      $unwind: {
        path: "$coachOnboardingResponse",
        preserveNullAndEmptyArrays: false,
      },
    },

    {
      $lookup: {
        from: "credentials",
        localField: "coachOnboardingResponse.credentials",
        foreignField: "_id",
        as: "coachOnboardingResponse.credentials",
      },
    },

    {
      $lookup: {
        from: "specialities",
        localField: "coachOnboardingResponse.specialities",
        foreignField: "_id",
        as: "coachOnboardingResponse.specialities",
      },
    },

    {
      $lookup: {
        from: "coachingstyles",
        localField: "coachOnboardingResponse.coachingStyle",
        foreignField: "_id",
        as: "coachOnboardingResponse.coachingStyle",
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
              createdAt: 1,
              averageRating: 1,
              totalReviews: 1,

              coachOnboardingResponse: {
                _id: "$coachOnboardingResponse._id",
                location: "$coachOnboardingResponse.location",
                acceptingWork: "$coachOnboardingResponse.acceptingWork",
                priceRange: "$coachOnboardingResponse.priceRange",
                credentials: "$coachOnboardingResponse.credentials",
                specialities: "$coachOnboardingResponse.specialities",
                coachingStyle: "$coachOnboardingResponse.coachingStyle",
              },
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
  const {
    // email,
    permissions,
    validationDocument,
    companyName,
    type,
    phoneNumber,
    profileIcon,
    name,
    timezone,
    location,
    username,
    gender,
    registrationNumber,
    dob,
    deviceId,
    deviceType,
    status,
    notifications,
    blueTick,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user_ = await User.findById(userId).session(session);
    if (!user_) throw new Error("User not found");
    const userType = user_.accountState.userType;
      const ModelToUse = USER_MODEL_MAP[userType] || require("../../../models/UserModel").User;
      const user = await ModelToUse.findById(userId).session(session);
      if (!user) throw new Error("User not found with the specific model");

    // Validate profileIcon
    if (profileIcon && profileIcon.startsWith("http")) {
      return {
        errorCode: 400,
        message: "url_not_accepted",
        field: "profileIcon",
      };
    }

    /*   // Check if email exists
      const existingUser = await User.findOne({ _id: { $ne: userId }, email: email.trim().toLowerCase() });
      if (existingUser && existingUser.verificationStatus.email === "verified") {
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "email_already",
        });
        return { responseSent: true };
      }
   */

    // Validate phone number if provided
    if (phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number
        // !validatePhoneNumber(`${phoneNumber.code}${phoneNumber.number}`).valid
      ) {
        return { errorCode: 400, message: "invalid_phone" };
      }

      const existingPhone = await User.findOne({
        _id: { $ne: userId },
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });

      if (existingPhone) {
        return { errorCode: 409, message: "phone_number_already" };
      }

      user.phoneNumber = phoneNumber;
      user.verificationStatus.phoneNumber = "pending";
    }
    if(companyName){
      user.companyName = companyName;
    }
    if(type){
      user.type = type;
    };
    if(registrationNumber){
      user.registrationNumber = registrationNumber;
    };
    if(location){
      user.location = location;
    };
    if(validationDocument){
      user.validationDocument = validationDocument;
    };

    if (name) user.name = name;
    if (profileIcon) user.profileIcon = profileIcon;
    if (timezone) user.timezone = timezone;
    if (username) user.username = username;
    if (gender) user.gender = gender;
    if (dob) user.dob = dob;
    if (status) user.accountState.status = status;
    if (blueTick !== undefined) {
      if (!user.accountState) user.accountState = {};
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

    if (notifications && typeof notifications === "object") {
      const allowedKeys = [
        "email",
        "push",
        "bookingReminders",
        "profileviews",
        "messages",
      ];

      allowedKeys.forEach((key) => {
        if (notifications[key] !== undefined) {
          user.notifications[key] = notifications[key];
        }
      });
    }


    await user.save({ session });


    if (permissions) {
      await findByIdAndUpdate(userId, permissions);

    }

    // Device handling
    if (deviceId && deviceType) {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    //if status is updated then send email to user
    if (status) {
      const mBody = accountStatusEmailTemplate(status, user.name);
      await sendEmailViaBrevo([user.email], "Account Status", mBody);
    }

    await session.commitTransaction();

    userCache.del(userId.toString());
    const userObject = user.toJSON();

    return formatUserResponse(userObject, null, [], ["resetToken"]);
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
};
