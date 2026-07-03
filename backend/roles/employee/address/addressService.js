const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const AddressRepo = require("./addressRepository");
const { cache, invalidate } = require("@redisCache");
const {formatUser} = require("./formator/imageFormator");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";

const invalidateAdminSettingsScope = async (scope) => {
  await invalidate(`${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}`);
};

const invalidateAddressCache = async () => {
  await invalidateAdminSettingsScope("faqs");
};

const createAddress = async (data) => {
  const Address = await AddressRepo.createAddress(data);
  return Address;
};

const getAddress = async ({
  page,
  limit,
  keyword,
  status,
  user
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { addresss, meta } = await AddressRepo.getAddresss({
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });


  return {
    addresss: addresss.map((address) => ({
      ...address,
      user: formatUser(address.user),
    })),
    meta,
  };
};

const updateAddress = async (id, data) => {
  const Address = await AddressRepo.findAddressById(id);

  if (!Address) {
    return { error: "Address_not_found" };
  }

  const allowedFields = ["location", "status"];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Address;
  }

  Object.assign(Address, updateData);
  await Address.save();

  await invalidateAddressCache();

  return Address;
};

const deleteAddress = async (id) => {
  if (!id) throw new Error("address_id_is_required");

  const deleted = await AddressRepo.deleteAddress(id);
  return !!deleted;
};

module.exports = {
  createAddress,
  getAddress,
  updateAddress,
  deleteAddress,
};
