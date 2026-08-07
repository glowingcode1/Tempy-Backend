const {
  validateParams,
  sendResponse,
  getReadableErrorMessage,
} = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { createOrSkipDevice } = require("../models/Devices");
const {
  User,
  USER_TYPES,
  APP_TWO_STEP_USER_TYPES,
} = require("../models/UserModel");
const { validatePhoneNumber } = require("../helperUtils/validationsUtil");
const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
const {
  registrationViaLinkEmailTemplate,
  registrationViaOtpEmailTemplate,
} = require("../helperUtils/emailTemplates");
const {
  defaultSetNotificationPreferences,
} = require("./notificationPreferencesController");
const {
  normalizeLocationValue,
} = require("../shared/locations/locationSchmea");

const USER_MODEL_MAP = {
  careHome: require("../models/CareHomesModel"),
  nurse: require("../models/Nurse"),
  hospital: require("../models/HospitalModel"),
  localAuthority: require("../models/LocalAuthority"),
  homeCareCompany: require("../models/HomeCareCompanyModel"),
  agency: require("../models/AgencyModel"),
  user: require("../models/UserModeldesciminator")(),
  guest: require("../models/UserModel").User,
  admin: require("../models/UserModel").User,
};

// Main utility function
// This function backs the app's "signUp" (step 1) endpoint AND the
// existing web registration endpoint.
//
// For userType "user" / "nurse" (app-side, two-step flow) ONLY the
// minimal signUp fields are persisted: email, password, name,
// profileIcon, timezone, deviceId/deviceType. Any completeProfile-only
// fields sent in the same request (phoneNumber, gender, taxNumber,
// governmentIdentity, degree, certification, location) are IGNORED
// here on purpose — they must be submitted later via the dedicated
// completeProfile API. `completeProfile` is set to false so the app
// knows to route to the completeProfile screen instead of home.
//
// For every other userType (web flow: careHome, hospital, agency,
// homeCareCompany, localAuthority, guest, admin) the previous
// single-step behaviour is preserved and `completeProfile` is set to
// true immediately, since those flows don't use a second step.
const registerUserUtility = async (req, res, staff, options = {}) => {
  const {
    autoVerify = false, // true if created by admin, false if app user
    allowAdminCreation = true, // 🔒 internal only
  } = options;

  let {
    email,
    phoneNumber,
    profileIcon,
    userType = "user",
    name,
    password,
    timezone = "Europe/Berlin",
    username,
    gender,
    dob,
    deviceId,
    deviceType,
    companyName,
    type,
    location,
    registrationNumber,
    validationDocument,
    taxNumber,
    governmentIdentity,
    degree,
    certification,
  } = req.body;

  let verificationStatus = "pending";
  try {
    let rawData = ["email", "password", "userType"];
    let objectIdFields = [];
    let dateFields = {};
    // let enumFields = {};

    // Adjust required fields by userType
    if (userType === "guest") verificationStatus = "active";

    const allowedUserTypes = [
      "guest",
      "user",
      "coach",
      "careHome",
      "agency",
      "user",
      "nurse",
      "hospital",
      "localAuthority",
      "homeCareCompany",
    ];

    if (options.allowAdminCreation) {
      allowedUserTypes.push("admin");
    }

    const validationOptions = {
      rawData,
      objectIdFields,
      dateFields,
      enumFields: {
        userType: allowedUserTypes,
        gender: ["", "Male", "Female", "Other"],
      },
      minLengthFields: { password: 6 },
    };

    if (!validateParams(req, res, validationOptions)) {
      return { responseSent: true }; // Mark that response is already sent
    }

    // Validate profile icon
    if (profileIcon && profileIcon.startsWith("http")) {
      if (!staff) {
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "url_not_accepted",
          values: { field: "profileIcon" },
        });

        return { responseSent: true };
      } else {
        return { error: "url_not_accepted" };
      }
    }

    // Admin token check for guest creation
    if (userType === "guest") {
      const adminToken = req.header("x-admin-access-token");
      if (adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
        if (!staff) {
          sendResponse({
            res,
            statusCode: 401,
            translationKey: "unauthorized_to_perform_this_action",
          });

          return { responseSent: true };
        } else {
          return { error: "unauthorized_to_perform_this_action" };
        }
      }
    }

    // 🔒 ADMIN CAN ONLY BE CREATED INTERNALLY
    if (req.body.userType === "admin") {
      const adminToken = req.header("x-admin-access-token");
      if (
        !options.allowAdminCreation ||
        adminToken !== process.env.ADMIN_ACCESS_TOKEN
      ) {
        sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to_create_admin",
        });

        return { responseSent: true };
      }
    }

    // Check if email exists
    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingUser && existingUser.verificationStatus.email === "verified") {
      sendResponse({
        res,
        statusCode: 400,
        translationKey: "email_already",
      });
      return { responseSent: true };
    }

    const isAppTwoStepSignup = APP_TWO_STEP_USER_TYPES.includes(userType);

    // Validate phone number — only relevant for the single-step (web)
    // flow, since app user/nurse signUp never accepts phoneNumber
    // (it's collected later in completeProfile).
    if (!isAppTwoStepSignup && phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validatePhoneNumber(`${phoneNumber.code}${phoneNumber.number}`).valid
      ) {
        sendResponse({ res, statusCode: 400, translationKey: "invalid_phone" });
        return { responseSent: true };
      }

      const existingPhone = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });
      if (existingPhone) {
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "phone_number_already",
        });
        return { responseSent: true };
      }
    }

    const ModelToUse =
      USER_MODEL_MAP[userType] || require("../models/UserModel").User;

    // ✅ Create instance from the correct model
    let user = existingUser || new ModelToUse();

    if (isAppTwoStepSignup) {
      // --- Step 1: signUp (app user / nurse) -----------------------
      // Only the fields collected on the app's "createAccount" signup
      // screen are set. Everything else (phoneNumber, gender,
      // taxNumber, governmentIdentity, degree, certification,
      // location) is deliberately left untouched here, even if it was
      // included in the request body, and must be submitted via the
      // completeProfile API before the account is considered ready
      // for the home screen.
      Object.assign(user, {
        email,
        profileIcon,
        name,
        password,
        timezone,
        location: normalizeLocationValue(location),
        accountState: { userType, status: verificationStatus },
        verificationStatus: {
          email: autoVerify ? "verified" : "pending",
          phoneNumber: "pending",
        },
        completeProfile: false,
      });
    } else {
      // --- Single-step (web) signup, unchanged behaviour -----------
      Object.assign(user, {
        email,
        phoneNumber: phoneNumber || { code: "", number: "" },
        profileIcon,
        name,
        username,
        gender,
        dob,
        password,
        timezone,
        companyName,
        type,
        location: normalizeLocationValue(location),
        registrationNumber,
        validationDocument,
        taxNumber,
        governmentIdentity,
        degree,
        certification,
        accountState: { userType, status: verificationStatus },
        verificationStatus: {
          email: autoVerify ? "verified" : "pending",
          phoneNumber: "pending",
        },
        completeProfile: true,
      });
    }

    // Generate email verification token if not auto-verified
    let emailVerificationLink = null;
    if (!autoVerify) {
      //send otp
      const otp = user.generateOtp("email", user.timezone);
      const mBody = registrationViaOtpEmailTemplate(otp);
      // await sendEmailViaBrevo([user.email], "Email Verification", mBody);
    }

    await user.save();

    defaultSetNotificationPreferences(user._id);

    // Optional device handling
    if (deviceId && deviceType && deviceId !== "test") {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    const userObject = user.toJSON();
    if (emailVerificationLink) {
      userObject.emailVerificationLink = emailVerificationLink;
    }
    const formattedResponse = formatUserResponse(userObject);

    return { success: true, user: formattedResponse, responseSent: false };
  } catch (error) {
    console.error("REGISTER USER ERROR");

    console.error(error);

    console.error(error.stack);
    if (error?.code === 11000) {
      const key = Object.keys(error?.keyPattern || {})[0];
      let translationKey = "duplicate_key";

      if (key === "email") translationKey = "email_already";
      if (key === "phoneNumber.code" || key === "phoneNumber.number") {
        translationKey = "phone_number_already";
      }

      sendResponse({
        res,
        statusCode: 400,
        translationKey,
        error,
      });

      return { responseSent: true };
    }

    const readableError = getReadableErrorMessage(error);
    sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
    return { responseSent: true };
  }
};

module.exports = { registerUserUtility };
