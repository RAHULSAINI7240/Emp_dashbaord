import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { projectsController } from './projects.controller';
import { projectCreateSchema, projectIdParamsSchema, projectUpdateSchema } from './projects.schema';

const router = Router();

router.use(authenticate);

router.get('/projects', projectsController.listWorkspace);
router.post('/projects', validate(projectCreateSchema), projectsController.create);
router.put('/projects/:id', validate(projectIdParamsSchema, 'params'), validate(projectUpdateSchema), projectsController.update);

export default router;
