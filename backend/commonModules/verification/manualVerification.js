const { recordOutcome } = require("./verificationRepository");

/*
 * Verifying by hand, which is how it works today and how it will keep working
 * for anything Persona does not cover.
 *
 * This writes the same Verification record and sets the same flag the webhook
 * will, so the rest of the platform never has to care which provider decided.
 * When Persona arrives it becomes a second writer, not a replacement, and the
 * gates do not change.
 */
const recordManualDecision = async ({
  subjectType,
  subject,
  approved,
  reviewedBy,
  note = "",
  expiresAt = null,
}) => {
  if (!subjectType || !subject) {
    throw new Error("subjectType and subject are required");
  }

  return recordOutcome({
    subjectType,
    subject,
    provider: "manual",

    /*
     * A manual decision has no inquiry, so it cannot be deduplicated on one.
     * eventCreatedAt still orders it against anything Persona sends later:
     * the newest decision wins, whoever made it.
     */
    inquiryId: null,
    eventId: null,
    eventCreatedAt: new Date(),

    status: approved ? "approved" : "declined",
    expiresAt,

    raw: {
      reviewedBy: reviewedBy ? String(reviewedBy) : null,
      note,
      reviewedAt: new Date().toISOString(),
    },
  });
};

module.exports = { recordManualDecision };
