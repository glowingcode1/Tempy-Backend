const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  generateMeta,
} = require("@helperUtils/responseUtil");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  createStripeAccount,
  createOnboardingLink,
  syncStripeAccountStatus,
  stripeCustomerByEmail,
  detachPaymentMethodToCustomer,
  attachPaymentMethodToCustomer,
  getPaymentMethods,
  getUserAccount,
   updateStripeAccountStatusFromObject,
  checkStripeAccount,
} = require("../utils/stripeUtil");

const UsersStripeAccounts = require("../models/UsersStripeAccounts");
const { User } = require("@UsersModel");

/* -----------------------------
   CREATE ACCOUNT
------------------------------*/

const createAccount = async (req, res) => {
  try {
    const result = await accountOnBoardMail({
      user: req.user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "account_created",
      data: {
        status: result.status,
        account: result.account,
        onBoardUrl: result.onBoardUrl || null,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.statusCode || 400,
      translationKey: error.translationKey || "server_error",
      error,
    });
  }
};

/* -----------------------------
   CORE ONBOARD LOGIC (PURE)
------------------------------*/

const accountOnBoardMail = async ({ user }) => {
  const { _id, email } = user;

  let existingAccount = await getUserAccount({ userId: _id });

  // ---------------- Existing account
  if (existingAccount) {
    if (!process.env.STRIPE_SECRET_KEY?.includes("test")) {
      await syncStripeAccountStatus(existingAccount);
    } else {
      existingAccount.isActive = true;
    }

    // already onboarded
    if (existingAccount.isActive) {
      return {
        account: existingAccount,
        status: "active",
        onBoardUrl: null,
      };
    }

    // still onboarding → generate fresh link
    const onBoardUrl = await createOnboardingLink(
      existingAccount.accountId
    );

    return {
      account: existingAccount,
      status: "pending",
      onBoardUrl,
    };
  }

  // ---------------- New account
  const { account } = await createStripeAccount("", email);

  const dbAccount = await UsersStripeAccounts.create({
    user: _id,
    accountId: account.id,
  });

  const onBoardUrl = await createOnboardingLink(account.id);

  return {
    account: dbAccount,
    status: "new",
    onBoardUrl,
  };
};

/* -----------------------------
   ONBOARD REDIRECT (optional legacy)
------------------------------*/

const accountOnBoardingUrl = async (req, res) => {
  try {
    const { id } = req.params;

    const onBoardUrl = await createOnboardingLink(id);

    return res.redirect(onBoardUrl);
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "server_error",
      error,
    });
  }
};

/* -----------------------------
   GET ONBOARDING URL
------------------------------*/

const getOnBoardingUrl = async (req, res) => {
  try {
    const account = await getUserAccount({
      userId: req.user._id,
    });

    if (!account) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "account_not_found",
      });
    }

    if (account.isActive) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "account_already_active",
      });
    }

    const onBoardUrl = await createOnboardingLink(account.accountId);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "fetch_success",
      data: {
        onBoardUrl,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "server_error",
      error,
    });
  }
};

/* -----------------------------
   PAYMENT METHODS
------------------------------*/

const getUserPaymentMethods = async (req, res) => {
  try {
    const { email } = req.user;
    const methods = email && (await getPaymentMethods({ email }));

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "fetch_success",
      data: methods || [],
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "fetching_failed",
      error,
    });
  }
};

const attachUserPaymentMethods = async (req, res) => {
  try {
    const { name, email } = req.user;
    const { paymentMethodId } = req.body;

    const customer = await stripeCustomerByEmail({ name, email });

    const methods = await attachPaymentMethodToCustomer({
      customerId: customer.id,
      name,
      email,
      paymentMethodId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "added_success",
      data: methods || [],
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "adding_failed",
    });
  }
};

const detachUserPaymentMethods = async (req, res) => {
  try {
    const { name, email } = req.user;
    const { paymentMethodId } = req.body;

    const customer = await stripeCustomerByEmail({ name, email });

    const methods = await detachPaymentMethodToCustomer({
      customer,
      paymentMethodId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "update_success",
      data: methods || [],
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "update_failed",
      error,
    });
  }
};

/* -----------------------------
   RESEND ONBOARD
------------------------------*/

const resendOnboardAccountMail = async (req, res) => {
  try {
    const result = await accountOnBoardMail({
      user: req.user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "stripe_onboard_mail",
      data: {
        account: result.account,
        status: result.status,
        onBoardUrl: result.onBoardUrl || null,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.statusCode || 400,
      translationKey: error.translationKey || "server_error",
      error,
    });
  }
};

const getAccount = async (req, res) => {
  try {
    const account = await UsersStripeAccounts.findOne({
      user: req.user._id,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "fetch_success",
      data: {
        exists: !!account,
        isActive: !!account?.isActive,
        onboardingStatus: account?.onboardingStatus || null,
        onboardingCompleted: account?.onboardingStatus === "completed",
        account: account || null,
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "server_error",
      error,
    });
  }
};


const handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET missing).");
    return res.status(500).send("Webhook configuration error: missing webhook secret.");
  }

  console.debug(
    "Stripe webhook received:",
    "bodyType=",
    Buffer.isBuffer(req.body) ? "Buffer" : typeof req.body,
    "bodyLength=",
    req.body?.length || 0,
    "signature=",
    signature ? signature.slice(0, 40) : "<missing>"
  );

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Stripe webhook signature failed:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "account.updated":
      case "account.application.authorized": {
        const stripeAccount = event.data.object;

        const updatedAccount =
          await updateStripeAccountStatusFromObject(stripeAccount, {
            lastStripeEventId: event.id,
          });

        if (!updatedAccount) {
          console.warn(
            `Stripe webhook event ${event.type} succeeded but no local DB account found:`,
            stripeAccount.id
          );
        }

        break;
      }

      case "capability.updated": {
        /**
         * Optional safety:
         * capability.updated may fire separately.
         * Retrieve full Stripe account and update local DB.
         */
        const capability = event.data.object;
        const accountId = capability.account;

        if (accountId) {
          const stripeAccount = await checkStripeAccount(accountId);

          await updateStripeAccountStatusFromObject(stripeAccount, {
            lastStripeEventId: event.id,
          });
        }

        break;
      }

      default:
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);

    return res.status(500).json({
      received: false,
      message: error.message,
    });
  }
};


/* -----------------------------
   EXPORTS
------------------------------*/

module.exports = {
  handleStripeWebhook,
  createAccount,
  accountOnBoardingUrl,
  getUserPaymentMethods,
  attachUserPaymentMethods,
  detachUserPaymentMethods,
  accountOnBoardMail,
  resendOnboardAccountMail,
  getOnBoardingUrl,
  getAccount
};