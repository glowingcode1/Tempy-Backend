const { sendResponse, getReadableErrorMessage } = require("./responseUtil");

/*
 * Wraps a controller whose service returns either { error, statusCode? } or
 * { data, meta? }, so each handler is only the call it makes.
 */
const sendServiceResult =
  (handler, successKey, successCode = 200) =>
  async (req, res) => {
    try {
      const result = await handler(req);

      if (!result) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "not_found",
        });
      }

      if (result.error) {
        return sendResponse({
          res,
          statusCode: result.statusCode || 400,
          translationKey: result.error,
        });
      }

      return sendResponse({
        res,
        statusCode: successCode,
        translationKey: successKey,
        data: result.data,
        ...(result.meta && { meta: result.meta }),
      });
    } catch (error) {
      const readableError = getReadableErrorMessage(error);
      return sendResponse({
        res,
        statusCode: readableError.statusCode,
        translationKey: readableError.message,
        error,
      });
    }
  };

module.exports = sendServiceResult;
