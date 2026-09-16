/*
 * The rule: an approved verification lets the account proceed. Anything else
 * does not.
 *
 * This is the only place that decision is made, so the webhook handler, the
 * admin screens and any retry flow cannot drift apart on what a given result
 * means. It is deliberately pure - no database, no Persona SDK - so the policy
 * can be read and tested on its own.
 */

// Persona inquiry statuses we act on. Anything else is still in flight.
const INQUIRY_OUTCOMES = {
  approved: {
    accountStatus: "active",
    canProceed: true,
    reasonKey: "verification_approved",
  },

  declined: {
    accountStatus: "rejected",
    canProceed: false,
    reasonKey: "rejected_verification",
  },

  /*
   * A human has to look at it. The account stays exactly where it was -
   * pending - which is the state the existing admin review queue already
   * understands.
   */
  needs_review: {
    accountStatus: "pending",
    canProceed: false,
    reasonKey: "verification_in_review",
  },

  // The user ran out of time or the flow broke. They may try again.
  expired: {
    accountStatus: "pending",
    canProceed: false,
    reasonKey: "verification_expired",
  },

  failed: {
    accountStatus: "pending",
    canProceed: false,
    reasonKey: "verification_failed",
  },
};

/*
 * An admin's decision outranks an automated result: a suspended or deleted
 * account must never be reactivated by a verification webhook arriving late.
 */
const ADMIN_LOCKED_STATUSES = ["suspended", "deleted", "cancelled"];

/**
 * Work out what a verification result means for an account.
 *
 * Returns `changed: false` when the result must not be applied, so the caller
 * can record the verification without touching the account.
 *
 * `requiresAdminReview` marks the one case we refuse to automate: an account
 * that is already active failing a later re-verification. Suspending a live
 * account - mid-shift, mid-booking - is not a decision to take from a webhook.
 */
const resolveAccountTransition = ({ currentStatus, inquiryStatus }) => {
  const outcome = INQUIRY_OUTCOMES[inquiryStatus];

  // Still in flight (created, pending, completed-but-undecided): do nothing.
  if (!outcome) {
    return {
      changed: false,
      canProceed: false,
      nextStatus: currentStatus,
      requiresAdminReview: false,
      reasonKey: "verification_pending",
    };
  }

  if (ADMIN_LOCKED_STATUSES.includes(currentStatus)) {
    return {
      changed: false,
      canProceed: false,
      nextStatus: currentStatus,
      requiresAdminReview: false,
      reasonKey: "account_state_locked_by_admin",
    };
  }

  const downgradesLiveAccount =
    currentStatus === "active" && outcome.accountStatus !== "active";

  if (downgradesLiveAccount) {
    return {
      changed: false,
      canProceed: true,
      nextStatus: currentStatus,
      requiresAdminReview: true,
      reasonKey: outcome.reasonKey,
    };
  }

  return {
    changed: outcome.accountStatus !== currentStatus,
    canProceed: outcome.canProceed,
    nextStatus: outcome.accountStatus,
    requiresAdminReview: false,
    reasonKey: outcome.reasonKey,
  };
};

module.exports = {
  INQUIRY_OUTCOMES,
  ADMIN_LOCKED_STATUSES,
  resolveAccountTransition,
};
