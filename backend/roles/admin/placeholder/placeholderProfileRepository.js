const { getFullImageUrl } = require("@helperUtils/imageHelper");
const PlaceholderProfile = require("./PlaceholderProfileModel");

const createPlaceholderProfile = async (data) => {
  const placeholderProfile = new PlaceholderProfile(data);
  return placeholderProfile.save();
};

const getPlaceholderProfile = async (filter = {}, skip, limit) => {
  const [placeholderProfile,total] = await Promise.all([
    PlaceholderProfile.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    PlaceholderProfile.countDocuments(filter).exec(),
  ]);
  return { placeholderProfile, total };
};

const getPlaceholderProfileCalender = async (filter = {}) => {
  const placeholderProfile = await PlaceholderProfile.aggregate([
    {
      $match: {
        ...filter,
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              name: 1,
              profileIcon: 1,
            },
          },
        ],
        as: "user",
      },
    },

    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$date",
          },
        },

        PlaceholderProfile: {
          $push: {
            PlaceholderProfileId: "$_id",
            title: "$title",
            description: "$description",
            status: "$status",
            date: "$date",
            priority: "$priority",

            user: {
              _id: "$user._id",
              name: "$user.name",
              profileIcon: "$user.profileIcon",
            },
          },
        },
      },
    },

    {
      $sort: {
        _id: 1,
      },
    },
  ]);
  const formatted = placeholderProfile.reduce((acc, item) => {
    acc[item._id] = item.PlaceholderProfile.map((placeholderProfile) => ({
      ...placeholderProfile,
      user: {
        ...placeholderProfile.user,
        profileIcon: getFullImageUrl(placeholderProfile.user.profileIcon),
      },
    }));
    return acc;
  }, {});
  return formatted;
};

const findPlaceholderProfileById = async (id, userId) => {
  const query = userId ? { _id: id, user: userId } : { _id: id };

  return PlaceholderProfile.findOne(query);
};

const updatePlaceholderProfileById = async (id, data, userId) => {
  const query = userId ? { _id: id, user: userId } : { _id: id };

  return PlaceholderProfile.findOneAndUpdate(query, data, {
    new: true,
    runValidators: true,
  });
};
const addPlaceholderProfileById = async (id, data) => {
  return PlaceholderProfile.findByIdAndUpdate(
    id,

    { $set: data },

    { new: true, runValidators: true },
  );
};

const deletePlaceholderProfileById = async (id, userId) => {
  const query = userId ? { _id: id } : { _id: id };

  return PlaceholderProfile.findOneAndUpdate(
    query,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    },
  );
};

module.exports = {
  createPlaceholderProfile,
  addPlaceholderProfileById,
  getPlaceholderProfile,
  findPlaceholderProfileById,
  updatePlaceholderProfileById,
  deletePlaceholderProfileById,
  getPlaceholderProfileCalender,
};
