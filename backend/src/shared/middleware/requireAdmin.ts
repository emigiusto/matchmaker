import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../../modules/auth/auth.service'
import { prisma } from '../../prisma'
import { AppError } from '../errors/AppError'

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) throw new AppError('Unauthorized', 401)
    const { userId } = verifyToken(authHeader.slice(7))
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
    if (!user?.isAdmin) throw new AppError('Forbidden', 403)
    next()
  } catch (err) {
    next(err)
  }
}
