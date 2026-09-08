const validator = require("validator");
const moment = require("moment");
const Staff = require("./Staff");
const { GENDER_TYPES } = require("@UsersModel");
const { validatePhoneNumber } = require("../../../helperUtils/validationsUtil");

const SPECIALITY_VALUES = Staff.schema.path("speciality").caster.enumValues;

// Outcome of a single CSV row
const IMPORT_ACTIONS = {
  INVITED: "invited", // email is registered but not staff here yet -> request sent
  SKIPPED: "skipped", // email is registered and already staff here -> no action
  CREATED: "created", // email is unknown -> new nurse created + request sent
  FAILED: "failed", // row could not be processed
};

// Columns accepted for every field, so agencies can keep their own header wording
const COLUMN_ALIASES = {
  name: ["name", "fullName", "staffName", "nurseName"],
  email: ["email", "emailAddress"],
  phoneCode: ["phoneCode", "countryCode", "phoneNumberCode", "dialCode"],
  phoneNumber: ["phoneNumber", "phone", "mobile", "contactNumber"],
  dob: ["dob", "dateOfBirth", "birthDate"],
  gender: ["gender", "sex"],
  branch: ["branch", "branchId", "branchName"],
  speciality: ["speciality", "specialities", "specialty", "specialties"],
  ratePerHour: ["ratePerHour", "hourlyRate", "rate"],
  platformPercent: ["platformPercent", "platformPercentage", "platformCut"],
  taxNumber: ["taxNumber", "taxId", "niNumber"],
  password: ["password", "tempPassword"],
  profileIcon: ["profileIcon", "profileImage", "avatar"],
  timezone: ["timezone", "timeZone"],
  governmentIdentity: [
    "governmentIdentity",
    "governmentId",
    "identityDocument",
  ],
  degree: ["degree", "degrees", "qualification", "qualifications"],
  certification: ["certification", "certifications", "certificate"],
  fullAddress: ["fullAddress", "address", "streetAddress"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  country: ["country"],
  postalCode: ["postalCode", "postcode", "zip", "zipCode"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
};

// "Phone Number", "phone_number" and "phoneNumber" all collapse to "phonenumber"
const BOM_PREFIX = new RegExp("^\uFEFF");

const normalizeKey = (key) =>
  String(key || "")
    .replace(BOM_PREFIX, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeRow = (row) => {
  const normalized = {};

  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] =
      typeof value === "string" ? value.trim() : value;
  }

  return normalized;
};

const pick = (row, field) => {
  for (const alias of COLUMN_ALIASES[field] || [field]) {
    const value = row[normalizeKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
};

// Accepts a JSON array or a ";" / "|" / "," separated list
const parseList = (value) => {
  if (!value) return [];

  const text = String(value).trim();

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // not JSON, fall back to the delimiter based parsing below
    }
  }

  return text
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseNumber = (value) => {
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseLocation = (row) => {
  const latitude = parseNumber(pick(row, "latitude"));
  const longitude = parseNumber(pick(row, "longitude"));

  const location = {
    fullAddress: pick(row, "fullAddress"),
    city: pick(row, "city"),
    state: pick(row, "state"),
    country: pick(row, "country"),
    postalCode: pick(row, "postalCode"),
  };

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    location.type = "Point";
    location.coordinates = [latitude, longitude];
  }

  const hasValue = Object.values(location).some((value) =>
    Array.isArray(value) ? value.length : value,
  );

  return hasValue ? location : undefined;
};

/**
 * Turns one raw CSV row into the payload the import service works with.
 * Returns { errors, data } where errors is empty when the row is usable.
 */
const parseStaffRow = (rawRow) => {
  const row = normalizeRow(rawRow);
  const errors = [];

  const email = pick(row, "email").toLowerCase();
  const name = pick(row, "name");
  const branch = pick(row, "branch");
  const speciality = parseList(pick(row, "speciality"));
  const ratePerHour = parseNumber(pick(row, "ratePerHour"));
  const platformPercent = parseNumber(pick(row, "platformPercent"));
  const phoneCode = pick(row, "phoneCode");
  const phoneNumber = pick(row, "phoneNumber");
  const dob = pick(row, "dob");
  const password = pick(row, "password");
  let gender = pick(row, "gender");

  if (!email) {
    errors.push("email is required");
  } else if (!validator.isEmail(email)) {
    errors.push("email is not a valid email address");
  }

  if (!name) errors.push("name is required");
  if (!branch) errors.push("branch is required (branch name or branch id)");

  if (!speciality.length) {
    errors.push("speciality is required");
  } else {
    const unknown = speciality.filter(
      (value) => !SPECIALITY_VALUES.includes(value),
    );
    if (unknown.length) {
      errors.push(
        `speciality ${unknown.join(", ")} is invalid, allowed values are: ${SPECIALITY_VALUES.join(", ")}`,
      );
    }
  }

  if (ratePerHour === undefined) {
    errors.push("ratePerHour is required");
  } else if (Number.isNaN(ratePerHour) || ratePerHour <= 0) {
    errors.push("ratePerHour must be a number greater than 0");
  }

  if (
    platformPercent !== undefined &&
    (Number.isNaN(platformPercent) ||
      platformPercent < 0 ||
      platformPercent > 100)
  ) {
    errors.push("platformPercent must be a number between 0 and 100");
  }

  if (gender) {
    const matched = GENDER_TYPES.find(
      (value) => value.toLowerCase() === gender.toLowerCase(),
    );
    if (!matched) {
      errors.push(`gender must be one of: ${GENDER_TYPES.join(", ")}`);
    }
    gender = matched;
  }

  if (dob && !moment(dob, "YYYY-MM-DD", true).isValid()) {
    errors.push("dob must use the YYYY-MM-DD format");
  }

  // Phone is optional, but a partial or malformed number is rejected
  let phone;
  if (phoneCode || phoneNumber) {
    const code = phoneCode.startsWith("+") ? phoneCode : `+${phoneCode}`;
    if (!phoneCode || !phoneNumber) {
      errors.push("phoneCode and phoneNumber must both be provided");
    } else if (!validatePhoneNumber(`${code}${phoneNumber}`).valid) {
      errors.push("phoneNumber is not a valid phone number");
    } else {
      phone = { code, number: phoneNumber };
    }
  }

  if (password && password.length < 6) {
    errors.push("password must be at least 6 characters");
  }

  return {
    errors,
    data: {
      email,
      name,
      branch,
      speciality,
      ratePerHour,
      platformPercent: platformPercent ?? 0,
      phoneNumber: phone,
      dob: dob || undefined,
      gender: gender || undefined,
      password: password || undefined,
      profileIcon: pick(row, "profileIcon") || undefined,
      timezone: pick(row, "timezone") || undefined,
      taxNumber: pick(row, "taxNumber") || undefined,
      governmentIdentity: parseList(pick(row, "governmentIdentity")),
      degree: parseList(pick(row, "degree")),
      certification: parseList(pick(row, "certification")),
      location: parseLocation(row),
    },
  };
};

const TEMPLATE_COLUMNS = [
  "name",
  "email",
  "phoneCode",
  "phoneNumber",
  "dob",
  "gender",
  "branch",
  "speciality",
  "ratePerHour",
  "platformPercent",
  "taxNumber",
  "password",
  "fullAddress",
  "city",
  "state",
  "country",
  "postalCode",
  "latitude",
  "longitude",
];

const TEMPLATE_ROWS = [
  {
    name: "Alice Morgan",
    email: "alice.morgan@example.com",
    phoneCode: "+44",
    phoneNumber: "7700900001",
    dob: "1992-04-18",
    gender: "Female",
    branch: "London Central",
    speciality: "generalNurse;elderlyCare",
    ratePerHour: "24.5",
    platformPercent: "10",
    taxNumber: "NI1234567",
    password: "",
    fullAddress: "12 Baker Street",
    city: "London",
    state: "Greater London",
    country: "United Kingdom",
    postalCode: "NW1 6XE",
    latitude: "51.5237",
    longitude: "-0.1585",
  },
  {
    name: "Daniel Okafor",
    email: "daniel.okafor@example.com",
    phoneCode: "+44",
    phoneNumber: "7700900002",
    dob: "1988-11-02",
    gender: "Male",
    branch: "London Central",
    speciality: "mentalHealth",
    ratePerHour: "28",
    platformPercent: "12",
    taxNumber: "NI7654321",
    password: "",
    fullAddress: "44 Kings Road",
    city: "London",
    state: "Greater London",
    country: "United Kingdom",
    postalCode: "SW3 4UD",
    latitude: "",
    longitude: "",
  },
  {
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    phoneCode: "+44",
    phoneNumber: "7700900003",
    dob: "1995-07-21",
    gender: "Female",
    branch: "Manchester North",
    speciality: "healthcareAssistant;supportWorker",
    ratePerHour: "19.75",
    platformPercent: "8",
    taxNumber: "NI9988776",
    password: "",
    fullAddress: "8 Oxford Road",
    city: "Manchester",
    state: "Greater Manchester",
    country: "United Kingdom",
    postalCode: "M1 3BB",
    latitude: "",
    longitude: "",
  },
];

const escapeCsvValue = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Sample CSV served by the template download endpoint
const buildStaffCsvTemplate = () => {
  const lines = [TEMPLATE_COLUMNS.join(",")];

  for (const row of TEMPLATE_ROWS) {
    lines.push(
      TEMPLATE_COLUMNS.map((column) => escapeCsvValue(row[column])).join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
};

module.exports = {
  IMPORT_ACTIONS,
  SPECIALITY_VALUES,
  TEMPLATE_COLUMNS,
  parseStaffRow,
  buildStaffCsvTemplate,
};
