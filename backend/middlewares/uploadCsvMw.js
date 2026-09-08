const multer = require("multer");
const { sendResponse } = require("../helperUtils/responseUtil");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");

    if (isCsv) return callback(null, true);

    const error = new Error("Only CSV files are allowed");
    error.code = "INVALID_FILE_TYPE";
    return callback(error);
  },
});

const single = upload.single("file");

// Multer rejections would otherwise reach the generic 500 handler, so they are
// translated into a 400 the client can show to the user
const uploadCsv = (req, res, next) =>
  single(req, res, (error) => {
    if (!error) return next();

    return sendResponse({
      res,
      statusCode: 400,
      translationKey:
        error.code === "LIMIT_FILE_SIZE"
          ? "csv_file_too_large"
          : "only_csv_files_are_allowed",
      error,
    });
  });

module.exports = uploadCsv;
