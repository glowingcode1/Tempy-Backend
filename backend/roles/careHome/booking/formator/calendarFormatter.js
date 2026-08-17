// utils/calendarFormatter.js

const { convertUtcToTimezone } = require("@helperUtils/responseUtil");
const { getFullImageUrl } = require("@helperUtils/imageHelper");

const weatherByDate = (weather = {}, timezone) => {
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
      sunrise: d.sunrise?.[i]
        ? convertUtcToTimezone(
            d.sunrise[i],
            timezone,
            "YYYY-MM-DDTHH:mm",
            "YYYY-MM-DDTHH:mm",
          )
        : null,
      sunset: d.sunset?.[i]
        ? convertUtcToTimezone(
            d.sunset[i],
            timezone,
            "YYYY-MM-DDTHH:mm",
            "YYYY-MM-DDTHH:mm",
          )
        : null,
    };
    return acc;
  }, {});
};

const buildWorkers = (
  roleBookings,
  days,
  wx,
  timezone,
  userId,
  userType,
  customer,
  supplier,
) => {
  const map = {};

  roleBookings.forEach((b) => {
    const id = String(b.worker?._id || b.worker?.name || "Unknown");

    const date = convertUtcToTimezone(
      b.shift?.date,
      timezone,
      "YYYY-MM-DD",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
    );

    map[id] ??= {
      workerId: b.worker?._id || null,
      workerName: b.worker?.name || "Unknown",
      schedule: {},
    };

    map[id].schedule[date] ??= {
      weather: wx[date] || null,
      shifts: [],
      availability: [],
    };

    const matchId =
      userType === "nurse"
        ? b.worker?._id
        : customer
          ? b.user?._id
          : supplier
            ? b.employer?._id
            : null;

    const isMyBooking = matchId ? String(matchId) === String(userId) : false;

    map[id].schedule[date].shifts.push({
      bookingId: b._id,
      startTime: convertUtcToTimezone(
        `${date}T${b.shift?.startTime}:00.000Z`,
        timezone,
        "HH:mm",
        "YYYY-MM-DDTHH:mm:ss.SSSZ",
      ),
      endTime: convertUtcToTimezone(
        `${date}T${b.shift?.endTime}:00.000Z`,
        timezone,
        "HH:mm",
        "YYYY-MM-DDTHH:mm:ss.SSSZ",
      ),
      status: b.status,
      breakMin: b.shift?.breakMin,
      isMyBooking,
      employer: {
        id: b.employer?._id || null,
        name: b.employer?.name || null,
        accountState: b.employer?.accountState || null,
      },
      user: {
        id: b.user?._id || null,
        name: b.user?.name || null,
        accountState: b.user?.accountState || null,
      },
    });

    (b.availability || []).forEach((a) => {
      const availDate = convertUtcToTimezone(
        a.startDateTime,
        timezone,
        "YYYY-MM-DD",
      );

      map[id].schedule[availDate] ??= {
        weather: wx[availDate] || null,
        shifts: [],
        availability: [],
      };

      const alreadyAdded = map[id].schedule[availDate].availability.some(
        (x) => String(x.id) === String(a._id),
      );

      if (!alreadyAdded) {
        map[id].schedule[availDate].availability.push({
          id: a._id,
          status: a.status,
          startDateTime: convertUtcToTimezone(
            a.startDateTime,
            timezone,
            "YYYY-MM-DDTHH:mm:ss.SSSZ",
          ),
          endDateTime: convertUtcToTimezone(
            a.endDateTime,
            timezone,
            "YYYY-MM-DDTHH:mm:ss.SSSZ",
          ),
        });
      }
    });
  });

  Object.values(map).forEach(({ schedule }) => {
    days.forEach((date) => {
      schedule[date] ??= {
        weather: wx[date] || null,
        shifts: [],
        availability: [],
      };
    });
  });

  Object.values(map).forEach((worker) => {
    worker.schedule = Object.fromEntries(
      Object.entries(worker.schedule).sort(([a], [b]) => a.localeCompare(b)),
    );
  });

  return Object.values(map);
};

const buildRoleTotals = (roleBookings) => {
  const uniqueWorkers = new Set();
  const totals = roleBookings.reduce(
    (acc, b) => {
      const p = b.payment || {};
      acc.totalShifts += 1;
      acc.totalHours += p.totalHours || 0;
      if (b.worker?.name) uniqueWorkers.add(b.worker.name);
      return acc;
    },
    { totalShifts: 0, totalHours: 0 },
  );

  totals.totalHours = +totals.totalHours.toFixed(2);
  totals.totalPeople = uniqueWorkers.size;
  return totals;
};

const formatCalendar = ({
  jobRoles = [],
  bookings = [],
  weather = {},
  timezone,
  userId,
  userType,
  customer,
  supplier,
}) => {
  const days = weather?.daily?.time || [];
  const wx = weatherByDate(weather, timezone);

  const roleIds = new Set(jobRoles.map((r) => String(r._id)));
  const calendar = {};

  jobRoles.forEach((role) => {
    const label = `${role.department} ${role.title}`;
    const roleBookings = bookings.filter(
      (b) => String(b?.snapshot?.type || "") === String(role._id),
    );
    calendar[label] = {
      totals: buildRoleTotals(roleBookings),
      workers: buildWorkers(
        roleBookings,
        days,
        wx,
        timezone,
        userId,
        userType,
        customer,
        supplier,
      ),
    };
  });

  const others = bookings.filter(
    (b) => !roleIds.has(String(b?.snapshot?.type || "")),
  );

  if (others.length) {
    calendar["Other"] = {
      totals: buildRoleTotals(others),
      workers: buildWorkers(
        others,
        days,
        wx,
        timezone,
        userId,
        userType,
        customer,
        supplier,
      ),
    };
  }

  const allWorkers = new Set(
    bookings.map((b) => b.worker?.name).filter(Boolean),
  );
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
  totals.totalPeople = allWorkers.size;

  return { meta: totals, calendar };
};

const formatShiftPlan = (bookings = [], timezone) => {
  const shiftsByDate = {};

  bookings.forEach((b) => {
    const date = convertUtcToTimezone(
      b.shift.date,
      timezone,
      "YYYY-MM-DD",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
    );

    const startTime = convertUtcToTimezone(
      `${date}T${b.shift.startTime}:00.000Z`,
      timezone,
      "hh:mm A",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
    );
    const endTime = convertUtcToTimezone(
      `${date}T${b.shift.endTime}:00.000Z`,
      timezone,
      "hh:mm A",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
    );

    shiftsByDate[date] ??= [];

    shiftsByDate[date].push({
      bookingId: b._id,
      name: b.snapshot?.name || "",
      jobType: b.snapshot?.type || "",
      location: b.snapshot?.location || "",
      image: getFullImageUrl(b.snapshot?.image),
      startTime,
      endTime,
      totalHours: b.payment?.totalHours || 0,
      perHour: b.payment?.perHour || 0,
      totalAmount: b.payment?.totalAmount || 0,
      status: b.status,
      checkInTime: startTime,
    });
  });

  return {
    markedDates: Object.keys(shiftsByDate).sort(),
    shiftsByDate,
  };
};

module.exports = { formatCalendar, formatShiftPlan };
