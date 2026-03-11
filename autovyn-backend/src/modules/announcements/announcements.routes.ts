import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRoles } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { announcementsController } from './announcements.controller';
import { announcementCreateSchema, announcementListQuerySchema } from './announcements.schema';

const router = Router();

router.use(authenticate);

router.get('/announcements', validate(announcementListQuerySchema, 'query'), announcementsController.list);
router.post('/announcements', requireRoles('ADMIN', 'HR'), validate(announcementCreateSchema), announcementsController.create);

export default router;
