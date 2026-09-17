const { sendResponse } = require("../helperUtils/responseUtil");

/*
 * Two different decisions gate an account, and they are not interchangeable:
 *
 *   accountState.status === "active"  - the admin's decision. It restores
 *                                       signing in, and nothing more.
 *   verificationStatus.persona        - the provider's decision. This is what
 *                                       allows taking part in the marketplace:
 *                                       posting jobs, bidding, booking.
 *
 * So an account an admin has activated still cannot post or bid until Persona
 * has approved it.
 */

/*
 * Off unless explicitly switched on.
 *
 * Nothing can grant the Persona flag until the integration is live, so
 * enforcing it by default would lock every existing customer and supplier out
 * of posting and bidding the moment this deploys. Set
 * PERSONA_VERIFICATION_ENFORCED=true once verifications are actually being
 * recorded - and backfill the existing accounts first.
 *
 * The account-status backstop below is never flagged: it protects against a
 * suspended account acting on a token that has not expired, which is true
 * regardless of Persona.
 */
const isPersonaEnforced = () =>
  process.env.PERSONA_VERIFICATION_ENFORCED === "true";

// Admin tooling must keep working regardless of the admin's own record.
const EXEMPT_USER_TYPES = ["admin"];

const REASON_BY_STATUS = {
  pending: "pending_approval",
  rejected: "rejected_verification",
  inactive: "your_account_2",
  suspended: "your_account_2",
  cancelled: "your_account_2",
  expired: "your_account_2",
  deleted: "your_account_2",
};

const requireVerifiedAccount = (req, res, next) => {
  if (EXEMPT_USER_TYPES.includes(req.user?.userType)) {
    return next();
  }

  if (isPersonaEnforced() && !req.user?.personaVerified) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "persona_verification_required",
    });
  }

  /*
   * Checked second, and only as a backstop. Tokens here are issued with no
   * expiry, so one minted while the account was healthy keeps working after a
   * suspension - the status check is what stops it being used.
   */
  const status = req.user?.accountStatus;

  if (status !== "active") {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: REASON_BY_STATUS[status] || "your_account_2",
    });
  }

  return next();
};

module.exports = requireVerifiedAccount;
module.exports.isPersonaEnforced = isPersonaEnforced;
