const assert = require("assert");
const { test } = require("node:test");
const { resolveInitialBookingStatus } = require("../bookingStatusHelper");

test("returns active when a nurse creates a booking for themselves", () => {
  const status = resolveInitialBookingStatus({
    createdByUserType: "nurse",
    createdByUserId: "user-123",
    workerId: "user-123",
  });

  assert.strictEqual(status, "active");
});

test("returns pending for other users", () => {
  const status = resolveInitialBookingStatus({
    createdByUserType: "customer",
    createdByUserId: "user-123",
    workerId: "user-456",
  });

  assert.strictEqual(status, "pending");
});
J