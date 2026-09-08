const { default: mongoose } = require("mongoose");

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
    // Project-wide convention: [latitude, longitude]
    coordinates: {
      type: [Number],
      required: false,
      validate: {
        validator: function (arr) {
          // Only validate if coordinates are provided
          if (!arr || arr.length === 0) return true;
          return arr.length === 2;
        },
        message: "Location.coordinates must be [latitude, longitude]",
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
// The schema default materialises `coordinates: []` with no `type`, which a
// 2dsphere index rejects outright ("unknown GeoJSON type"). Normalise the empty
// case to [0, 0] — the sentinel the distance helpers already read as "no
// location" — so a document without coordinates stays storable and indexable.
LocationSchema.pre("validate", function () {
  const [latitude, longitude] = this.coordinates || [];

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    this.coordinates = [0, 0];
  }

  if (!this.type) {
    this.type = "Point";
  }
});

module.exports = {
  LocationSchema,
};
