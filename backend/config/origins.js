const isDev =
  process.env.NODE_ENV === "dev" ||
  process.env.NODE_ENV === "mobileapps";

const PROD_ORIGINS = [
  "https://coachcritic.com",
  "https://www.coachcritic.com",
  "https://dev.coachcritic.com",
  "https://www.dev.coachcritic.com",
  "http://localhost:4003",
  "http://localhost:3030",
  "https://coachcritic.vercel.app",
  "http://192.168.13.67:4003"
];

module.exports = {
  isDev,
  allowedOrigins: isDev ? [] : PROD_ORIGINS,
  connectSrc: isDev ? ["*"] : ["'self'", ...PROD_ORIGINS],
};