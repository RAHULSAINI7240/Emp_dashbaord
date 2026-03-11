import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { adminLoginSchema, employeeLoginSchema, loginSchema, tokenSchema } from './auth.schema';
import { loginRateLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema), authController.login);
router.post('/login/admin', loginRateLimiter, validate(adminLoginSchema), authController.loginAdmin);
router.post('/login/employee', loginRateLimiter, validate(employeeLoginSchema), authController.loginEmployee);
router.post('/refresh', validate(tokenSchema), authController.refresh);
router.post('/logout', validate(tokenSchema), authController.logout);

export default router;
