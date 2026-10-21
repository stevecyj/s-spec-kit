// @ts-check
import multer from 'multer';

export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message
   * @param {string[]} [details]
   */
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  /**
   * @param {string} message
   * @param {string[]} [details]
   */
  constructor(message, details = []) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends HttpError {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(404, code, message);
  }
}

/**
 * @param {import('express').RequestHandler} handler
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? '檔案大小超過系統可接收上限，已拒絕這次上傳'
        : '上傳內容無法處理，請重新選擇照片';
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message, details: [] },
    });
    return;
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '請求內容不是有效的 JSON', details: [] },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: '系統發生未預期的錯誤，請稍後再試',
      details: [],
    },
  });
}
