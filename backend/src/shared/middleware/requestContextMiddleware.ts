import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { requestContext } from '../context/requestContext'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null

  let isImpersonated = false
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { impersonatedBy?: string }
      isImpersonated = !!payload.impersonatedBy
    } catch {
      // Invalid token — not impersonated
    }
  }

  requestContext.run({ isImpersonated }, next)
}
