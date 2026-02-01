// src/shared/errors/errorHandler.ts
// Express error handling middleware
// TODO: Add detailed error responses and logging

import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';


// Example usage in app.ts:
//   import { errorHandler } from './shared/errors/errorHandler';
//   app.use(errorHandler);

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Log error stack for diagnostics
  // eslint-disable-next-line no-console
  console.error('[ERROR]', err.stack || err);
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
      errorCode: err.errorCode,
      statusCode: err.statusCode,
    });
  } else {
    res.status(500).json({
      message: 'Internal Server Error',
      errorCode: 'INTERNAL_ERROR',
      statusCode: 500,
    });
  }
}
