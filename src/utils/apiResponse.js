class ApiResponse {
  static success(res, data, messageKey = 'success.OPERATION_SUCCESS', statusCode = 200) {
    const message = res.req.t ? res.req.t(messageKey, { defaultValue: messageKey }) : messageKey;
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, messageKey = 'errors.SERVER_ERROR', statusCode = 400) {
    const message = res.req.t ? res.req.t(messageKey, { defaultValue: messageKey }) : messageKey;
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
}

export default ApiResponse;
