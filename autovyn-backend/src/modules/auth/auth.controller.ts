import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { authService } from './auth.service';

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const { loginId, password } = req.body;
    const data = await authService.login(loginId, password);
    return sendSuccess(res, 'Login successful.', data, 200);
  }),

  loginAdmin: asyncHandler(async (req: Request, res: Response) => {
    const { adminId, password } = req.body;
    const data = await authService.loginAdmin(adminId, password);
    return sendSuccess(res, 'Admin login successful.', data, 200);
  }),

  loginEmployee: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId, password } = req.body;
    const data = await authService.loginEmployee(employeeId, password);
    return sendSuccess(res, 'Employee login successful.', data, 200);
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const data = await authService.refresh(refreshToken);
    return sendSuccess(res, 'Token refreshed successfully.', data, 200);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    return sendSuccess(res, 'Logged out successfully.', { loggedOut: true }, 200);
  })
};
