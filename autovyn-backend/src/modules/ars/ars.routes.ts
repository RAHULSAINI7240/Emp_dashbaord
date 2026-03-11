import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAnyPermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { objectIdSchema } from '../../utils/object-id';
import { arsController } from './ars.controller';
import { arsApproveSchema, arsApprovalsQuerySchema, arsDeclineSchema, arsMyQuerySchema, arsRequestSchema } from './ars.schema';

const router = Router();

router.use(authenticate);

router.post('/ars/request', validate(arsRequestSchema), arsController.request);
router.get('/ars/my', validate(arsMyQuerySchema, 'query'), arsController.my);

router.get(
  '/ars/approvals/pending',
  requireAnyPermission('APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'),
  validate(arsApprovalsQuerySchema, 'query'),
  arsController.pendingApprovals
);

router.post('/ars/:id/approve', validate(z.object({ id: objectIdSchema }), 'params'), validate(arsApproveSchema), arsController.approve);
router.post('/ars/:id/decline', validate(z.object({ id: objectIdSchema }), 'params'), validate(arsDeclineSchema), arsController.decline);

export default router;
