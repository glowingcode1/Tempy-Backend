const PriceRange = require("./PriceRangeModel");
const { cache, invalidate } = require("@redisCache");
const PRICE_RANGES_CACHE_KEY = "priceRanges";

const createPriceRange = async ({ price, status }) => {
  const priceRange = new PriceRange({
    price: price || "",
    status,
  });
  const saved = await priceRange.save();
  await invalidate(PRICE_RANGES_CACHE_KEY);
  return saved;
};

const getPriceRanges = async (filter = {}) => {
  return cache({
    namespace: PRICE_RANGES_CACHE_KEY,
    params: filter,
    fetchFn: () => PriceRange.find(filter).sort({ createdAt: -1 }).exec()
  });
};

const findPriceRangeById = async (id) => {
  return cache({
    namespace: PRICE_RANGES_CACHE_KEY,
    params: { id },
    fetchFn: () => PriceRange.findById(id)
  });
};

const updatePriceRangeById = async (id, data) => {
  const updated = await PriceRange.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  await invalidate(PRICE_RANGES_CACHE_KEY);
  return updated;
};

const deletePriceRangeById = async (id) => {
  const deleted = await PriceRange.findByIdAndUpdate(
    id,
    { status: "deleted" },
    {
      new: true,
      runValidators: true,
    }
  );
  await invalidate(PRICE_RANGES_CACHE_KEY);
  return deleted;
};

module.exports = {
  createPriceRange,
  getPriceRanges,
  findPriceRangeById,
  updatePriceRangeById,
  deletePriceRangeById,
};
