const mongoose = require("mongoose");

const convertToMongoArray = (idsString) => {
  if (!idsString) return [];

  return String(idsString)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
};

module.exports = convertToMongoArray;
