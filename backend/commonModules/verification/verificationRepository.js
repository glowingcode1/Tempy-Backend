const Verification = require("./Verification");
const Branches = require("../../roles/aggency/branches/Branches");
const { User } = require("../../models/UserModel");
const { userCache } = require("../../config/nodeCache");

/*
 * Writing a verification result has two halves: the record (source of truth)
 * and the projection onto the subject (the boolean the gate reads). They are
 * kept together here so they cannot drift.
 */

/**
 * Should this webhook event be applied to the row we already hold?
 *
 * Pure, because it is the part that is easy to get wrong and the part worth
 * testing: Persona redelivers events and does not guarantee order, so a
 * declined decision can arrive after the approval that superseded it.
 */
const shouldApplyEvent = ({ existing, eventId, eventCreatedAt }) => {
  if (!existing) {
    return { apply: true, reason: "new" };
  }

  if (eventId && existing.eventId && existing.eventId === eventId) {
    return { apply: false, reason: "duplicate" };
  }

  if (eventCreatedAt && existing.eventCreatedAt) {
    const incoming = new Date(eventCreatedAt).getTime();
    const held = new Date(existing.eventCreatedAt).getTime();

    if (Number.isFinite(incoming) && Number.isFinite(held) && incoming <= held) {
      return { apply: false, reason: "out_of_order" };
    }
  }

  return { apply: true, reason: "newer" };
};

/**
 * Point the subject's boolean at the newest verification it has.
 *
 * Read back rather than trusting the event we just handled, so an out-of-order
 * delivery cannot leave the flag describing a superseded decision.
 */
const projectLatestOntoSubject = async ({ subjectType, subject }) => {
  const latest = await Verification.findOne({ subjectType, subject })
    .sort({ eventCreatedAt: -1, createdAt: -1 })
    .select("status expiresAt")
    .lean();

  const notLapsed =
    !latest?.expiresAt || new Date(latest.expiresAt).getTime() > Date.now();

  const verified = latest?.status === "approved" && notLapsed;

  if (subjectType === "branch") {
    await Branches.updateOne(
      { _id: subject },
      { $set: { "persona.verified": verified } },
    );

    return { verified };
  }

  await User.updateOne(
    { _id: subject },
    { $set: { "verificationStatus.persona": verified } },
  );

  /*
   * authMiddleware serves req.user from a one hour cache, and the gate reads
   * the flag off it. Without this an approved user stays blocked, and a
   * revoked one stays allowed, until the entry happens to expire.
   */
  userCache.del(String(subject));

  return { verified };
};

/**
 * Record one provider decision and reproject the subject's flag.
 *
 * Idempotent: the same event applied twice changes nothing the second time.
 */
const recordOutcome = async ({
  subjectType,
  subject,
  provider = "persona",
  inquiryId,
  status,
  eventId,
  eventCreatedAt,
  ...rest
}) => {
  const existing = inquiryId
    ? await Verification.findOne({ provider, inquiryId })
    : null;

  const decision = shouldApplyEvent({ existing, eventId, eventCreatedAt });

  if (!decision.apply) {
    return { applied: false, reason: decision.reason, verification: existing };
  }

  const update = {
    subjectType,
    subject,
    provider,
    inquiryId: inquiryId || null,
    status,
    eventId: eventId || null,
    eventCreatedAt: eventCreatedAt || null,
    decidedAt: ["approved", "declined"].includes(status) ? new Date() : null,
    ...rest,
  };

  const verification = existing
    ? await Verification.findOneAndUpdate(
        { _id: existing._id },
        { $set: update },
        { new: true },
      )
    : await Verification.create(update);

  const projection = await projectLatestOntoSubject({ subjectType, subject });

  return {
    applied: true,
    reason: decision.reason,
    verification,
    verified: projection.verified,
  };
};

module.exports = {
  shouldApplyEvent,
  projectLatestOntoSubject,
  recordOutcome,
};
