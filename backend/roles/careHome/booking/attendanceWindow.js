/*
 * When a shift's attendance actions are allowed.
 *
 * Shared by the check-in/check-out endpoint and the auto-checkout sweep so
 * the two never disagree about where a shift's boundaries are: the sweep
 * closes a shift at exactly the moment the endpoint stops accepting a manual
 * check-out for it.
 */

// Staff arrive a little early, so check-in opens shortly before the shift
// does — but no earlier, or the timesheet starts before the shift exists.
const CHECK_IN_EARLY_WINDOW_MIN =
  Number(process.env.CHECK_IN_EARLY_WINDOW_MINUTES) || 15;

/*
 * How long after the end of a shift a worker may still check out by hand.
 * Once it lapses the sweep closes the shift for them, so this is also the
 * age at which a forgotten check-out is written automatically.
 */
const CHECK_OUT_GRACE_MIN =
  Number(process.env.AUTO_CHECKOUT_GRACE_MINUTES) || 15;

const toMinutes = (time) => {
  if (typeof time !== "string") return null;

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
};

// The shift carries a UTC date plus an "HH:mm" time.
const atTime = (date, time) => {
  if (!date) return null;

  const minutes = toMinutes(time);

  if (minutes === null) return null;

  const at = new Date(date);

  if (Number.isNaN(at.getTime())) return null;

  at.setUTCHours(0, minutes, 0, 0);

  return at;
};

const shiftStartsAt = (shift) => atTime(shift?.date, shift?.startTime);

/*
 * An end time at or before the start time means the shift runs past midnight,
 * so it ends on the following day — otherwise a 22:00–06:00 shift would look
 * like it ended sixteen hours before it began.
 */
const shiftEndsAt = (shift) => {
  const start = shiftStartsAt(shift);
  const end = atTime(shift?.date, shift?.endTime);

  if (!end) return null;

  if (start && end.getTime() <= start.getTime()) {
    return new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return end;
};

// A shift whose times cannot be read is left to the callers' other checks.
const isCheckInWindowOpen = (shift, now = Date.now()) => {
  const start = shiftStartsAt(shift);

  if (!start) return true;

  return now >= start.getTime() - CHECK_IN_EARLY_WINDOW_MIN * 60 * 1000;
};

const isCheckOutWindowOpen = (shift, now = Date.now()) => {
  const end = shiftEndsAt(shift);

  if (!end) return true;

  return now <= end.getTime() + CHECK_OUT_GRACE_MIN * 60 * 1000;
};

module.exports = {
  CHECK_IN_EARLY_WINDOW_MIN,
  CHECK_OUT_GRACE_MIN,
  shiftStartsAt,
  shiftEndsAt,
  isCheckInWindowOpen,
  isCheckOutWindowOpen,
};
