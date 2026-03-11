import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { policiesController } from './policies.controller';
import { policiesUpsertSchema } from './policies.schema';

const router = Router();

router.use(authenticate);

router.get('/policies', policiesController.latest);
router.post('/policies', requireAdmin, validate(policiesUpsertSchema), policiesController.upsert);

export default router;
