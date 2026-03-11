import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAnyPermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { objectIdSchema } from '../../utils/object-id';
import { leavesController } from './leaves.controller';
import {
  leaveActionSchema,
  leaveApprovalsQuerySchema,
  leaveListMyQuerySchema,
  leaveRequestSchema
} from './leaves.schema';

const router = Router();

router.use(authenticate);

router.post('/leaves/request', validate(leaveRequestSchema), leavesController.request);
router.get('/leaves/my', validate(leaveListMyQuerySchema, 'query'), leavesController.my);
router.get('/leaves/summary', leavesController.summary);
router.get('/leaves/approvers', leavesController.approvers);

router.get(
  '/leaves/approvals/pending',
  requireAnyPermission('APPROVE_LEAVE', 'MANAGER', 'TEAM_LEAD'),
  validate(leaveApprovalsQuerySchema, 'query'),
  leavesController.pendingApprovals
);

router.get(
  '/leaves/approvals/history',
  requireAnyPermission('APPROVE_LEAVE', 'MANAGER', 'TEAM_LEAD'),
  validate(leaveApprovalsQuerySchema, 'query'),
  leavesController.approvalHistory
);

router.post('/leaves/:id/approve', validate(z.object({ id: objectIdSchema }), 'params'), validate(leaveActionSchema), leavesController.approve);
router.post('/leaves/:id/decline', validate(z.object({ id: objectIdSchema }), 'params'), validate(leaveActionSchema), leavesController.decline);

export default router;
