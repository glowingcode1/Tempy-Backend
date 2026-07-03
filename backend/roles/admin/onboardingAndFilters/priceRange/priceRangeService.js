const priceRangeRepo = require("./priceRangeRepository");

const getPriceRanges = async (filter = {}) => {
  const priceRanges = await priceRangeRepo.getPriceRanges(filter);
  //consider price ranges as number and sort them in ascending order before returning
  priceRanges.sort((a, b) => {
    const priceA = parseFloat(a.price.replace(/[^0-9.-]+/g, ""));
    const priceB = parseFloat(b.price.replace(/[^0-9.-]+/g, ""));
    return priceA - priceB;
  });
  return {
    priceRanges,
  };
};

const getPriceRangeById = async (id) => {
  return priceRangeRepo.findPriceRangeById(id);
};

const createPriceRange = async ({ price, status }) => {
  return priceRangeRepo.createPriceRange({
    price,
    status,
  });
};

const updatePriceRange = async (id, { price, status }) => {
  return priceRangeRepo.updatePriceRangeById(id, { price, status });
};

const deletePriceRange = async (id) => {
  return priceRangeRepo.deletePriceRangeById(id);
};

module.exports = {
  getPriceRanges,
  getPriceRangeById,
  createPriceRange,
  updatePriceRange,
  deletePriceRange,
};
