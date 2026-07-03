const Faq = require("@FaqModel");
const AddressModel = require("./Address");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const { cache, invalidate } = require("@redisCache");
const { lookup } = require("mime-types");
const { default: mongoose } = require("mongoose");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";
const buildAdminSettingsCacheKey = ({
  scope = "public",
  skip = 0,
  limit = 10,
  date = "",
  status = "",
  keyword = "",
  userId = "",
  type = "",
}) => {
  return `${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}:${skip}:${limit}:${date}:${status}:${keyword}:${userId}:${type}`;
};
const invalidateAdminSettingsScope = async (scope) => {
  await invalidate(`${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}`);
};
const createAddress = async (data) => {
  try {
    const Address = new AddressModel(data);
    await Address.save();
    return Address;
  } catch (err) {
    throw err;
  }
};

const getAddresss = async ({ page, limit, keyword, status, user, skip }) => {
  const pipeline = [];
  if (user) {
    pipeline.push({
      $match: {
        user: new mongoose.Types.ObjectId(user),
      },
    });
  }

  if (status) {
    pipeline.push({
      $match: {
        status,
      },
    });
  } else {
    pipeline.push({
      $match: {
        status: { $ne: "deleted" },
      },
    });
  }

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "user",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            phone: 1,
            profileIcon: 1,
            accountState: 1,
          },
        },
      ],
      as: "user",
    },
  });

pipeline.push({
  $unwind: {
    path: "$user",
    preserveNullAndEmptyArrays: true,
  },
});

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: AddressModel.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({
        $match: keywordMatch,
      });
    }
  }

  pipeline.push({
    $sort: {
      createdAt: -1,
    },
  });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [
        {
          $count: "count",
        },
      ],
    },
  });

  const result = await AddressModel.aggregate(pipeline);

  const addresss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  return {
    addresss,
    meta,
  };
};

const findAddressById = async (id) => {
  return AddressModel.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  const invalidations = [];
  invalidations.push("faqs");
  await Promise.all(
    invalidations.map((scope) => invalidateAdminSettingsScope(scope)),
  );
  return Faq.findByIdAndUpdate(id, data, { new: true });
};
const deleteAddress = async (id) => {
  return await AddressModel.findByIdAndUpdate(
    id,
    { status: "deleted" },
    { new: true },
  );
};
module.exports = {
  createAddress,
  getAddresss,
  findAddressById,
  findByIdAndUpdate,
  deleteAddress,
};
