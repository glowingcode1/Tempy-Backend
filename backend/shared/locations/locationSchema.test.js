const assert = require("assert");
const { test } = require("node:test");
const { normalizeLocationValue } = require("./locationSchmea");

test("normalizes empty location payload into a valid Point", () => {
  const location = {
    title: "",
    coordinates: [],
    fullAddress: "",
    city: "",
    country: "",
    state: "",
    postalCode: "",
  };

  const normalized = normalizeLocationValue(location);

  assert.deepStrictEqual(normalized.coordinates, [0, 0]);
  assert.strictEqual(normalized.type, "Point");
});
