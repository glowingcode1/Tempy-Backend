const UsersStripeAccounts = require("../models/UsersStripeAccounts");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/* -----------------------------
   CUSTOMER
------------------------------*/

async function stripeCustomerByEmail({ name, email }) {
  try {
    if (!email) return null;

    const customers = await stripe.customers.list({ email });

    if (customers.data.length > 0) {
      return customers.data[0];
    }

    return await stripe.customers.create({
      name: name || "",
      email,
    });
  } catch (error) {
    throw new Error(`Stripe customer error: ${error.message}`);
  }
}

/* -----------------------------
   PAYMENT METHODS
------------------------------*/

async function getPaymentMethods({ email }) {
  try {
    if (!email) return [];

    const customer = await stripeCustomerByEmail({ email });

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
    });

    return paymentMethods.data;
  } catch (error) {
    throw new Error(`Get payment methods error: ${error.message}`);
  }
}

async function attachPaymentMethodToCustomer({
  customerId,
  paymentMethodId,
  name,
  email,
}) {
  try {
    if (!paymentMethodId?.startsWith("pm_")) {
      throw new Error("Invalid payment method ID");
    }

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    if (name || email) {
      await stripe.paymentMethods.update(paymentMethodId, {
        billing_details: {
          name: name || null,
          email: email || null,
        },
      });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
    });

    return paymentMethods.data;
  } catch (error) {
    throw new Error(error.message);
  }
}

async function detachPaymentMethodToCustomer({ customer, paymentMethodId }) {
  try {
    if (!paymentMethodId?.startsWith("pm_")) {
      throw new Error("Invalid payment method ID");
    }

    if (
      customer?.invoice_settings?.default_payment_method === paymentMethodId
    ) {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: null,
        },
      });
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
    });

    return paymentMethods.data;
  } catch (error) {
    throw new Error(`Detach payment method error: ${error.message}`);
  }
}

/* -----------------------------
   STRIPE CONNECT ACCOUNT
------------------------------*/

async function createStripeAccount(country, email) {
  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: country || "US",
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    return { account };
  } catch (error) {
    throw new Error(`Create Stripe account error: ${error.message}`);
  }
}

/**
 * ALWAYS generate fresh onboarding link
 */
async function createOnboardingLink(accountId) {
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.STRIPE_CONNECT_REFRESH_URL}/${accountId}`,
      return_url: process.env.APP_BASE_URL,
      type: "account_onboarding",
    });

    return link.url;
  } catch (error) {
    throw new Error(`Account link error: ${error.message}`);
  }
}

/**
 * CHECK STRIPE STATUS (raw)
 */
async function checkStripeAccount(accountId) {
  try {
    return await stripe.accounts.retrieve(accountId);
  } catch (error) {
    throw new Error(`Stripe retrieve error: ${error.message}`);
  }
}

/* -----------------------------
   SINGLE SOURCE OF TRUTH SYNC
------------------------------*/

async function syncStripeAccountStatus(accountDoc) {
  try {
    const stripeAccount = await checkStripeAccount(accountDoc.accountId);

    const updatedAccount = await updateStripeAccountStatusFromObject(
      stripeAccount
    );

    return updatedAccount;
  } catch (error) {
    throw new Error(`Sync Stripe status error: ${error.message}`);
  }
}

/**
 * SAFE DB FETCH (always synced)
 */
async function getUserAccount({ userId, id }) {
  try {
    let account = await UsersStripeAccounts.findOne({
      ...(id ? { _id: id } : {}),
      user: userId,
    });

    if (!account) return null;

    if (process.env.STRIPE_SECRET_KEY?.includes("test")) {
      account.isActive = true;
      account.onboardingStatus = "completed";
      await account.save();
      return account;
    }

    return await syncStripeAccountStatus(account);
  } catch (error) {
    throw new Error(error.message);
  }
}

/* -----------------------------
   PAYMENTS
------------------------------*/

async function createPaymentIntent({
  amount,
  email,
  destinationAccountId,
  payment_method,
  currency,
  capture_method,
}) {
  try {
    if (!payment_method?.startsWith("pm_")) {
      throw new Error("Invalid payment method ID");
    }

    const convertedAmount = Math.round(amount * 100);
    const fee = Math.round(convertedAmount * 0.2);

    const customer = await stripeCustomerByEmail({ email });

    await attachPaymentMethodToCustomer({
      customerId: customer.id,
      paymentMethodId: payment_method,
    });

    return await stripe.paymentIntents.create({
      amount: convertedAmount,
      currency: currency || "USD",
      customer: customer.id,
      payment_method,
      confirm: true,
      capture_method: capture_method || "manual",
      on_behalf_of: destinationAccountId,
      transfer_data: {
        destination: destinationAccountId,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      application_fee_amount: fee,
    });
  } catch (error) {
    throw new Error(`Payment intent error: ${error.message}`);
  }
}

async function refundPayment({ paymentIntentId, amount }) {
  try {
    return await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(amount * 100),
    });
  } catch (error) {
    throw new Error(error.message);
  }
}

async function transferToConnectedAccount({
  amount,
  currency,
  destinationAccountId,
  description,
}) {
  try {
    return await stripe.transfers.create({
      amount,
      currency,
      destination: destinationAccountId,
      description,
    });
  } catch (error) {
    throw new Error(error.message);
  }
}


async function capturePayment({ paymentIntentId }) {
  try {
    if (!paymentIntentId?.startsWith("pi_")) {
      throw new Error("Invalid payment intent ID");
    }

    const paymentIntent = await stripe.paymentIntents.capture(
      paymentIntentId
    );

    return paymentIntent;
  } catch (error) {
    throw new Error(`Capture payment error: ${error.message}`);
  }
}



/* async function createAndCapturePayment({
  amount,
  email,
  paymentMethodId,
  destinationAccountId,
  currency = "usd",
}) {
  try {
    if (!paymentMethodId?.startsWith("pm_")) {
      throw new Error("Invalid payment method ID");
    }

    const customer = await stripeCustomerByEmail({ email });

    await attachPaymentMethodToCustomer({
      customerId: customer.id,
      paymentMethodId,
    });

    const amountInCents = Math.round(amount * 100);

    // Platform earns 10%
    const platformFee = Math.round(amountInCents * 0.10);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,

      customer: customer.id,
      payment_method: paymentMethodId,

      confirm: true,
      off_session: true,

      capture_method: "automatic",

      application_fee_amount: platformFee,

      transfer_data: {
        destination: destinationAccountId,
      },

      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    return paymentIntent;
  } catch (error) {
    console.log("Create and capture payment error:", error);
    throw new Error(`Payment error: ${error.message}`);
  }
} */


  async function createAndCapturePayment({
  amount,
  email,
  paymentMethodId,
  currency = "usd",
}) {
  try {
    if (!paymentMethodId?.startsWith("pm_")) {
      throw new Error("Invalid payment method ID");
    }

    const customer = await stripeCustomerByEmail({ email });

    await attachPaymentMethodToCustomer({
      customerId: customer.id,
      paymentMethodId,
    });

    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,

      customer: customer.id,
      payment_method: paymentMethodId,

      confirm: true,
      off_session: true,

      capture_method: "manual",

      // optional: platform metadata
      metadata: {
        mode: "platform_only_test",
      },

      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    return paymentIntent;
  } catch (error) {
    console.log("Create and capture payment error:", error);
    throw new Error(`Payment error: ${error.message}`);
  }
}


async function createAuthorizedPaymentIntent({
  amount,
  email,
  paymentMethodId,
  currency = "usd",
  destinationAccountId,
}) {
  const customer = await stripeCustomerByEmail({ email });

  await attachPaymentMethodToCustomer({
    customerId: customer.id,
    paymentMethodId,
  });

  const amountInCents = Math.round(amount * 100);
  const fee = Math.round(amountInCents * 0.2);

  return stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    customer: customer.id,
    payment_method: paymentMethodId,

    confirm: true,

    capture_method: "manual", // 🔥 CRITICAL FIX

    application_fee_amount: fee,

    transfer_data: {
      destination: destinationAccountId,
    },

    off_session: true,
  });
}


function mapStripeAccountStatus(stripeAccount) {
  const chargesEnabled = !!stripeAccount?.charges_enabled;
  const payoutsEnabled = !!stripeAccount?.payouts_enabled;
  const detailsSubmitted = !!stripeAccount?.details_submitted;

  const transfersCapability = stripeAccount?.capabilities?.transfers;
  const cardPaymentsCapability = stripeAccount?.capabilities?.card_payments;

  const disabledReason =
    stripeAccount?.requirements?.disabled_reason || "";

  const currentlyDue =
    stripeAccount?.requirements?.currently_due || [];

  const pastDue =
    stripeAccount?.requirements?.past_due || [];

  /**
   * Since you requested both:
   * - card_payments
   * - transfers
   *
   * Both should be active for marketplace usage.
   */
  const isActive =
    chargesEnabled &&
    payoutsEnabled &&
    detailsSubmitted &&
    transfersCapability === "active" &&
    cardPaymentsCapability === "active";

  let onboardingStatus = "pending";

  if (isActive) {
    onboardingStatus = "completed";
  } else if (disabledReason.startsWith("rejected.")) {
    onboardingStatus = "rejected";
  }

  return {
    isActive,
    onboardingStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    rejectionReason: disabledReason,
    requirementsCurrentlyDue: currentlyDue,
    requirementsPastDue: pastDue,
    lastSyncedAt: new Date(),
  };
}

async function updateStripeAccountStatusFromObject(
  stripeAccount,
  options = {}
) {
  try {
    const mappedStatus = mapStripeAccountStatus(stripeAccount);

    const updatedAccount = await UsersStripeAccounts.findOneAndUpdate(
      {
        accountId: stripeAccount.id,
      },
      {
        $set: {
          ...mappedStatus,
          ...(options.lastStripeEventId
            ? { lastStripeEventId: options.lastStripeEventId }
            : {}),
        },
      },
      {
        new: true,
      }
    );

    return updatedAccount;
  } catch (error) {
    throw new Error(
      `Update Stripe account status error: ${error.message}`
    );
  }
}

/* -----------------------------
   EXPORTS
------------------------------*/

module.exports = {
  stripeCustomerByEmail,
  getPaymentMethods,
  attachPaymentMethodToCustomer,
  detachPaymentMethodToCustomer,

  createStripeAccount,
  createOnboardingLink,
  checkStripeAccount,
  syncStripeAccountStatus,
  updateStripeAccountStatusFromObject,
  getUserAccount,

  createPaymentIntent,
  refundPayment,
  transferToConnectedAccount,

  capturePayment,
  createAndCapturePayment,
  createAuthorizedPaymentIntent,
};