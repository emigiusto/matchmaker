import { Request, Response, NextFunction } from 'express';
import { createGuestUser, findAllUsers, findUserById, findUserByPhone } from './users.service';
import { createGuestUserSchema } from './users.validators';
import { createUser, updateUser, deleteUser } from './users.service';
import { createUserSchema, updateUserSchema } from './users.validators';

export async function createUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await createUser(data.name, data.phone);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function findAllUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await findAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function updateUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = updateUserSchema.parse(req.body);
    const user = await updateUser(id, data.name, data.phone);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function deleteUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await deleteUser(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function createGuestUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createGuestUserSchema.parse(req.body);
    const user = await createGuestUser(data.name, data.phone);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function findUserByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await findUserById(id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function findUserByPhoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await findUserByPhone(req.query.phone as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
}
