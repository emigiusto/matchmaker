// src/shared/middleware/requestLogger.ts
// Express middleware for logging requests
// TODO: Enhance with request IDs, response times, etc.

import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.url}`);
  next();
}
