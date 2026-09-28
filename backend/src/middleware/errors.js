import { ZodError } from 'zod';
import multer from 'multer';

export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export function errorHandler(error, req, res, _next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message;
  let fields = {};
  if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please check the highlighted fields.';
    fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]));
  } else if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    code = error.code;
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Your slip is too large. Choose an image no larger than 5 MiB.'
        : 'Upload exactly one slip image.';
  } else if (error.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'This record already exists.';
  }
  if (status >= 500) {
    console.error(
      JSON.stringify({
        requestId: req.id,
        error: error.name,
        code: error.code || 'INTERNAL_ERROR',
      }),
    );
    message = 'Something went wrong. Please try again.';
    code = 'INTERNAL_ERROR';
  }
  res
    .status(status)
    .json({ error: { code, message, fields, ...error.details, requestId: req.id } });
}
