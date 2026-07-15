// utils/calendarFormatter.js

const toKey = (date) => new Date(date).toISOString().split("T")[0];

const weatherByDate = (weather = {}) => {
  const d = weather?.daily;
  if (!d?.time) return {};

  return d.time.reduce((acc, date, i) => {
    acc[date] = {
      temperature: d.temperature_2m_mean?.[i],
      humidityMax: d.relative_humidity_2m_max?.[i],
      humidityMin: d.relative_humidity_2m_min?.[i],
      uvIndex: d.uv_index_max?.[i],
      wetBulb: d.wet_bulb_temperature_2m_mean?.[i],
      weatherCode: d.weather_code?.[i],
      sunrise: d.sunrise?.[i],
      sunset: d.sunset?.[i],
    };
    return acc;
  }, {});
};

/* build the worker -> date -> shifts map for one bucket of bookings */
const buildWorkers = (roleBookings, days, wx) => {
  const workers = {};

  roleBookings.forEach((b) => {
    const name = b.worker?.name || "Unknown";
    const date = toKey(b.shift?.date);

    workers[name] ??= {};
    workers[name][date] ??= { weather: wx[date] || null, shifts: [] };

    workers[name][date].shifts.push({
      bookingId: b._id,
      startTime: b.shift?.startTime,
      endTime: b.shift?.endTime,
      status: b.status,
      breakMin: b.shift?.breakMin,
    });
  });

  // fill remaining days with weather only
  Object.values(workers).forEach((byDate) => {
    days.forEach((date) => {
      byDate[date] ??= { weather: wx[date] || null, shifts: [] };
    });
  });

  return workers;
};

const formatCalendar = ({ jobRoles = [], bookings = [], weather = {} }) => {
  const days = weather?.daily?.time || [];
  const wx = weatherByDate(weather);

  const roleIds = new Set(jobRoles.map((r) => String(r._id)));
  const calendar = {};

  jobRoles.forEach((role) => {
    const label = `${role.department} ${role.title}`;
    const roleBookings = bookings.filter(
      (b) => String(b?.snapshot?.type || "") === String(role._id),
    );
    calendar[label] = buildWorkers(roleBookings, days, wx);
  });

  // no type, or a type that doesn't match any role we were given
  const others = bookings.filter(
    (b) => !roleIds.has(String(b?.snapshot?.type || "")),
  );

  if (others.length) {
    calendar["Other"] = buildWorkers(others, days, wx);
  }

  // one set of totals, across every booking
  const totals = bookings.reduce(
    (acc, b) => {
      const p = b.payment || {};
      acc.totalShifts += 1;
      acc.totalHours += p.totalHours || 0;
      acc.totalCost += p.totalAmount || 0;
      acc.totalPaidToWorker += p.amountPayedToWorker || 0;
      return acc;
    },
    { totalShifts: 0, totalHours: 0, totalCost: 0, totalPaidToWorker: 0 },
  );

  totals.totalHours = +totals.totalHours.toFixed(2);
  totals.totalCost = +totals.totalCost.toFixed(2);
  totals.totalPaidToWorker = +totals.totalPaidToWorker.toFixed(2);

  return { meta: totals, calendar };
};

module.exports = { formatCalendar };
