import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAnyPermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  attendanceDayQuerySchema,
  attendanceMonthQuerySchema,
  attendanceReportQuerySchema,
  punchActionSchema
} from './attendance.schema';
import { attendanceController } from './attendance.controller';

const router = Router();

router.use(authenticate);

router.post('/attendance/punch-in', validate(punchActionSchema), attendanceController.punchIn);
router.post('/attendance/punch-out', validate(punchActionSchema), attendanceController.punchOut);
router.get('/attendance/month', validate(attendanceMonthQuerySchema, 'query'), attendanceController.month);
router.get('/attendance/day', validate(attendanceDayQuerySchema, 'query'), attendanceController.day);
router.get(
  '/attendance/report',
  requireAnyPermission('APPROVE_LEAVE', 'APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'),
  validate(attendanceReportQuerySchema, 'query'),
  attendanceController.report
);

export default router;
