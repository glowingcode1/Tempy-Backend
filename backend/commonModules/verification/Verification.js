const mongoose = require("mongoose");

/*
 * The record of a verification attempt - the source of truth.
 *
 * The booleans on User.verificationStatus.persona and Branches.persona.verified
 * are a projection of the newest row here, kept because the gate runs on every
 * write request and must not pay for a lookup. This collection is what answers
 * the questions a boolean cannot: when was it approved, against which inquiry,
 * which checks passed, what was actually submitted, and when does it lapse.
 *
 * One row per inquiry, never overwritten in place, so re-verification builds a
 * history rather than erasing the last decision.
 */

const CheckSchema = new mongoose.Schema(
  {
    // e.g. "government_id", "selfie", "database", "business_registration"
    name: { type: String, required: true },
    status: { type: String, default: "" },
    reasons: { type: [String], default: [] },
  },
  { _id: false },
);

const DocumentSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "" },
    // Provider-hosted asset. Expires, so it is a pointer, not storage.
    assetUrl: { type: String, default: "" },
  },
  { _id: false },
);

const VerificationSchema = new mongoose.Schema(
  {
    /*
     * Polymorphic on purpose: an individual, a business and a branch are all
     * verified, and which of them the client wants covered is still open.
     */
    subjectType: {
      type: String,
      enum: ["user", "branch"],
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    provider: {
      type: String,
      enum: ["persona", "manual"],
      default: "persona",
    },

    // What the provider calls it. referenceId is our own subject id echoed back.
    inquiryId: { type: String, default: null },
    accountId: { type: String, default: null },
    templateId: { type: String, default: null },
    referenceId: { type: String, default: null },

    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "declined",
        "needs_review",
        "expired",
        "failed",
      ],
      default: "pending",
      index: true,
    },

    checks: { type: [CheckSchema], default: [] },
    documents: { type: [DocumentSchema], default: [] },

    decidedAt: { type: Date, default: null },

    // null means it never lapses. Set when the client confirms a policy.
    expiresAt: { type: Date, default: null },

    /*
     * Webhook hygiene. Persona redelivers events and does not guarantee
     * order, so both are needed: eventId to drop duplicates, eventCreatedAt
     * to reject a stale decision arriving after a newer one.
     */
    eventId: { type: String, default: null },
    eventCreatedAt: { type: Date, default: null },

    // Kept verbatim so a disputed decision can be reconstructed.
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// "the newest verification for this subject" - the projection query
VerificationSchema.index({ subjectType: 1, subject: 1, createdAt: -1 });

// One row per provider inquiry
VerificationSchema.index(
  { provider: 1, inquiryId: 1 },
  { unique: true, partialFilterExpression: { inquiryId: { $type: "string" } } },
);

// Duplicate webhook deliveries collide here rather than being applied twice
VerificationSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: "string" } } },
);

// Drives the expiry sweep
VerificationSchema.index({ expiresAt: 1 });

const Verification = mongoose.model("Verification", VerificationSchema);

module.exports = Verification;
