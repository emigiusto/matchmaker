import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../../modules/auth/auth.service'
import { AppError } from '../errors/AppError'

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) throw new AppError('Unauthorized', 401)
    const { userId } = verifyToken(authHeader.slice(7))
    ;(req as any).userId = userId
    ;(req as any).user = { id: userId }
    next()
  } catch (err) {
    next(err)
  }
}
