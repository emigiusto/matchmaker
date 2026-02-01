// src/shared/errors/AppError.ts
// Custom application error class
// TODO: Extend for more error types and metadata


// Example usage in a service:
//   throw new AppError('User not found', 404, 'USER_NOT_FOUND');

export class AppError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}
