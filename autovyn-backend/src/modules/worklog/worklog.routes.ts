import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { worklogController } from './worklog.controller';
import { worklogHeartbeatSchema, worklogSummaryQuerySchema } from './worklog.schema';

const router = Router();

router.use(authenticate);

router.post('/worklog/heartbeat', validate(worklogHeartbeatSchema), worklogController.heartbeat);
router.get('/worklog/summary', validate(worklogSummaryQuerySchema, 'query'), worklogController.summary);

export default router;
