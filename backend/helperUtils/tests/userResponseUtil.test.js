require("module-alias/register");
const assert = require("assert");
const { test } = require("node:test");
const { formatUserResponse } = require("../userResponseUtil");

test("includes completeProfile in formatted user responses", () => {
  const response = formatUserResponse({
    _id: "user-1",
    name: "Test User",
    email: "test@example.com",
    profileIcon: "",
    gender: "Other",
    phoneNumber: { code: "+1", number: "2345678" },
    language: "en",
    country: "US",
    isOnboardingCompletedDoc: false,
    accountState: { userType: "nurse", status: "active" },
    verificationStatus: { email: "verified", phoneNumber: "pending" },
    twoFA: { isEnabled: false },
    location: null,
    timezone: "UTC",
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
    completeProfile: true,
  });

  assert.strictEqual(response.completeProfile, true);
});
