// auth.routes.ts

import { Router } from 'express';
import { signupController, loginController, meController, forgotPasswordController, resetPasswordController } from './auth.controller';

const router = Router();

router.post('/signup', signupController);
router.post('/login', loginController);
router.get('/me', meController);
router.post('/forgot-password', forgotPasswordController);
router.post('/reset-password', resetPasswordController);

export default router;
