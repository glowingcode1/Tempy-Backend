const { getFullImageUrl } = require("@helperUtils/imageHelper");

// Haversine — great-circle distance in km
const getDistanceKm = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to)) return null;

  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  // [0,0] is the schema default, not a real place
  if (!lat1 && !lng1) return null;
  if (!lat2 && !lng2) return null;

  const R = 6371; // earth radius, km
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return Math.round(R * 2 * Math.asin(Math.sqrt(a)) * 100) / 100; // 2dp
};

const formatStaffList = (
  users = [],
  { favoriteStaff = [], reviews = [], weeklyHours = [], job = {} } = {},
) => {
  if (!users.length) return [];

  const favMap = new Map(
    favoriteStaff.map((f) => [String(f.id), f.isFavorite]),
  );
  const reviewMap = new Map(reviews.map((r) => [String(r.id ?? r._id), r]));
  const hoursMap = new Map(weeklyHours.map((w) => [String(w.userId), w.hours]));

  const jobCoords = job?.location?.coordinates ?? null;

  return users.map((user) => {
    const id = String(user._id);
    const review = reviewMap.get(id);
    const loc = user.location;

    const weeklyHours = user.weeklyHours ?? 0;
    const bookedHoursThisWeek = hoursMap.get(id) ?? 0;

    return {
      id,
      name: user.name ?? "",
      userType: user.userType ?? "",
      weeklyHours,
      bookedHoursThisWeek,
      availabilityStatus:
        bookedHoursThisWeek >= weeklyHours ? "notAvailable" : "available",
      distanceKm: getDistanceKm(loc?.coordinates, jobCoords),
      profileIcon: user.profileIcon ? getFullImageUrl(user.profileIcon) : "",
      isFavorite: favMap.get(id) ?? false,
      averageRating: review?.averageRating ?? 0,
      totalReviews: review?.totalReviews ?? 0,
    };
  });
};

module.exports = { formatStaffList };
