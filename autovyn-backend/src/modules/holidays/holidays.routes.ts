import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRoles } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { holidaysController } from './holidays.controller';
import { holidayCreateSchema, holidayListQuerySchema } from './holidays.schema';

const router = Router();

router.use(authenticate);

router.get('/holidays', validate(holidayListQuerySchema, 'query'), holidaysController.list);
router.post('/holidays', requireRoles('ADMIN', 'HR'), validate(holidayCreateSchema), holidaysController.create);

export default router;
