const multer = require("multer");

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      file.originalname.toLowerCase().endsWith(".csv");

    callback(isCsv ? null : new Error("Only CSV files are allowed"), isCsv);
  },
}).single("file");

module.exports = uploadCsv;
