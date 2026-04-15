import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRoles } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { screenshotsController } from './screenshots.controller';
import { screenshotUploadSchema, screenshotBatchUploadSchema, screenshotListQuerySchema } from './screenshots.schema';

const router = Router();

router.use(authenticate);

// Employee agent uploads a screenshot
router.post('/screenshots/upload', validate(screenshotUploadSchema), screenshotsController.upload);

// Employee agent uploads a batch of screenshots
router.post('/screenshots/upload-batch', validate(screenshotBatchUploadSchema), screenshotsController.uploadBatch);

// Admin fetches screenshots for an employee on a given date
router.get('/screenshots', requireRoles('ADMIN'), validate(screenshotListQuerySchema, 'query'), screenshotsController.list);

// Admin subscribes to live screenshot stream
router.get('/screenshots/stream', requireRoles('ADMIN'), screenshotsController.stream);

export default router;
