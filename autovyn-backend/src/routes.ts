import { Router } from 'express';
import { prisma } from './db/prisma';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import leavesRoutes from './modules/leaves/leaves.routes';
import arsRoutes from './modules/ars/ars.routes';
import announcementsRoutes from './modules/announcements/announcements.routes';
import holidaysRoutes from './modules/holidays/holidays.routes';
import policiesRoutes from './modules/policies/policies.routes';
import worklogRoutes from './modules/worklog/worklog.routes';
import projectsRoutes from './modules/projects/projects.routes';
import credentialsRoutes from './modules/credentials/credentials.routes';
import { sendFailure, sendSuccess } from './utils/api-response';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });

    return sendSuccess(
      res,
      'Autovyn backend is running.',
      {
        status: 'ok',
        database: 'ok',
        timestamp: new Date().toISOString()
      },
      200
    );
  } catch (error) {
    return sendFailure(res, 'Database is unavailable.', 'DATABASE_UNAVAILABLE', 503, {
      status: 'degraded',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
      reason: error instanceof Error ? error.message : 'Unknown database error'
    });
  }
});

router.use('/auth', authRoutes);
router.use(usersRoutes);
router.use(attendanceRoutes);
router.use(leavesRoutes);
router.use(arsRoutes);
router.use(announcementsRoutes);
router.use(holidaysRoutes);
router.use(policiesRoutes);
router.use(worklogRoutes);
router.use(projectsRoutes);
router.use(credentialsRoutes);

export default router;
