// auth.controller.ts – HTTP handlers for auth

import { Request, Response, NextFunction } from 'express';
import * as AuthService from './auth.service';
import type { SignupInput, LoginInput } from './auth.types';
import { findUserById } from '../users/users.service';

export async function signupController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as SignupInput;
    const result = await AuthService.signup(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as LoginInput;
    const result = await AuthService.login(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function meController(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { userId } = AuthService.verifyToken(token);
    const user = await findUserById(userId);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isGuest: user.isGuest,
    });
  } catch (err) {
    next(err);
  }
}
