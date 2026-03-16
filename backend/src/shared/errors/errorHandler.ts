// src/shared/errors/errorHandler.ts
// Express error handling middleware
// TODO: Add detailed error responses and logging

import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';


// Example usage in app.ts:
//   import { errorHandler } from './shared/errors/errorHandler';
//   app.use(errorHandler);

const isDev = process.env.ENVIRONMENT === 'DEVELOPMENT' || process.env.NODE_ENV !== 'production';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    // Only log server-side errors; 4xx are expected client errors
    if (err.statusCode >= 500) {
      // eslint-disable-next-line no-console
      console.error('[ERROR]', err.stack || err);
    }
    res.status(err.statusCode).json({
      message: err.message,
      errorCode: err.errorCode,
      statusCode: err.statusCode,
    });
  } else {
    const payload: Record<string, unknown> = {
      message: 'Internal Server Error',
      errorCode: 'INTERNAL_ERROR',
      statusCode: 500,
    };
    if (isDev && err) {
      payload.debug = { message: err.message, stack: err.stack };
    }
    res.status(500).json(payload);
  }
}
