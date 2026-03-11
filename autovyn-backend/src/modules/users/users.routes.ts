import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAnyPermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { usersController } from './users.controller';
import { approverQuerySchema, createUserSchema, listTeamMembersQuerySchema, updateMyProfilePhotoSchema } from './users.schema';
import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

const router = Router();

router.use(authenticate);

router.post('/users', validate(createUserSchema), usersController.create);
router.get('/users/me', usersController.me);
router.patch('/users/me/photo', validate(updateMyProfilePhotoSchema), usersController.updateMyProfilePhoto);
router.get('/users/approvers', validate(approverQuerySchema, 'query'), usersController.approvers);

router.get('/team/members', requireAnyPermission('VIEW_TEAM'), validate(listTeamMembersQuerySchema, 'query'), usersController.listTeamMembers);
router.get('/team/member/:id', validate(z.object({ id: objectIdSchema }), 'params'), usersController.getTeamMember);

export default router;
