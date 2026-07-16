const AvailabilityRepo = require("./availabilityRepository");
const formatAvailabilityToTimezone = require("./formator/formatAvailabilityToTimezone");

const createAvailability = async (data) => {
  const availability = await AvailabilityRepo.createAvailability(data);
  return availability;
};

const getAvailability = async ({
  timezone,
  page,
  limit,
  status,
  user,
  startDate,
  endDate,
  summary,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  if (summary) {
    const { availability, meta } =
      await AvailabilityRepo.getAvailabilitySummary({
        page,
        limit,
        status,
        user,
        startDate,
        endDate,
        skip,
      });
    return { availability, meta };
  }

  const { availability, meta } = await AvailabilityRepo.getAvailability({
    page,
    limit,
    status,
    user,
    startDate,
    endDate,
    skip,
  });

  const formatedAvailability = availability.map((a) =>
    formatAvailabilityToTimezone(a, timezone),
  );

  return { availability: formatedAvailability, meta };
};

const updateAvailability = async (id, data) => {
  const availability = await AvailabilityRepo.findAvailabilityById_(id);

  if (!availability) {
    return { error: "Availability_not_found" };
  }

  const updateData = Object.fromEntries(
    Object.entries({
      status: data.status,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
    }).filter(([, value]) => value !== undefined),
  );

  if (updateData.startDateTime || updateData.endDateTime) {
    const duplicate = await AvailabilityRepo.findOverlappingAvailability({
      user: availability.user,
      startDateTime: updateData.startDateTime || availability.startDateTime,
      endDateTime: updateData.endDateTime || availability.endDateTime,
      excludeId: availability._id,
    });

    if (duplicate) {
      return {
        error: "Availability_overlaps_with_existing_entry",
      };
    }
  }

  if (Object.keys(updateData).length === 0) {
    return availability;
  }

  Object.assign(availability, updateData);

  await availability.save();

  return availability;
};

const getAvailabilityDetails = async (id, timezone) => {
  const availability = await AvailabilityRepo.findAvailabilityById(id);

  if (!availability) {
    return null;
  }

  return formatAvailabilityToTimezone(availability, timezone);
};

const deleteAvailability = async (id) => {
  if (!id) throw new Error("Availability ID is required");
  const deleted = await AvailabilityRepo.deleteAvailability(id);
  return !!deleted;
};

module.exports = {
  createAvailability,
  getAvailability,
  updateAvailability,
  deleteAvailability,
  getAvailabilityDetails,
};
