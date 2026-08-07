const { default: mongoose } = require("mongoose");

const normalizeLocationValue = (value) => {
  if (!value || typeof value !== "object") {
    return {
      title: "",
      type: "Point",
      coordinates: [0, 0],
      fullAddress: "",
      city: "",
      country: "",
      state: "",
      postalCode: "",
    };
  }

  const normalized = {
    title: value.title || "",
    type: value.type || "Point",
    coordinates:
      Array.isArray(value.coordinates) && value.coordinates.length === 2
        ? value.coordinates.map((coord) => Number(coord))
        : [0, 0],
    fullAddress: value.fullAddress || "",
    city: value.city || "",
    country: value.country || "",
    state: value.state || "",
    postalCode: value.postalCode || "",
  };

  if (!normalized.coordinates.every((coord) => Number.isFinite(coord))) {
    normalized.coordinates = [0, 0];
  }

  return normalized;
};

const LocationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number],
      required: false,
      validate: {
        validator: function (arr) {
          // Only validate if coordinates are provided
          if (!arr || arr.length === 0) return true;
          return arr.length === 2;
        },
        message: "Location.coordinates must be [lng, lat]",
      },
    },
    fullAddress: {
      type: String, // Full formatted address, e.g., "13th Street 47, NY 10011, USA"
      default: "",
    },
    city: {
      type: String, // City name
      default: "",
    },
    country: {
      type: String, // Country name
      default: "",
    },
    state: {
      type: String, // State name
      default: "",
    },
    postalCode: {
      type: String, // Postal code
      default: "",
    },
  },
  { _id: false },
);
LocationSchema.pre("validate", function () {
  const normalized = normalizeLocationValue(this.toObject({ virtuals: false }));
  this.title = normalized.title;
  this.type = normalized.type;
  this.coordinates = normalized.coordinates;
  this.fullAddress = normalized.fullAddress;
  this.city = normalized.city;
  this.country = normalized.country;
  this.state = normalized.state;
  this.postalCode = normalized.postalCode;
});

module.exports = {
  LocationSchema,
  normalizeLocationValue,
};
