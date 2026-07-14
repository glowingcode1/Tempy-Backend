// utils/buildProjection.js

const buildProjection = (fieldsParam, allowed, { always = ["_id"] } = {}) => {
  try {
    if (!fieldsParam) return null; // nothing passed → return everything

    const requested = String(fieldsParam)
      .split(",")

      .map((f) => f.trim())

      .filter(Boolean);

    // whitelist check: allow "type" if "type" is allowed, and also "type.title"

    const safe = requested.filter((f) =>
      allowed.some((a) => f === a || f.startsWith(`${a}.`)),
    );

    if (!safe.length) return null; // all garbage → fall back to full doc

    const projection = {};

    for (const f of [...always, ...safe]) projection[f] = 1;

    return projection;
  } catch (error) {
    console.error("Error in buildProjection:", error);

    return null;
  }
};

module.exports = { buildProjection };
