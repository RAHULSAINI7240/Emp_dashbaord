import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { credentialsController } from './credentials.controller';
import { credentialCreateSchema, credentialIdParamsSchema, credentialUpdateSchema } from './credentials.schema';

const router = Router();

router.use(authenticate);

router.get('/credentials', credentialsController.list);
router.post('/credentials', validate(credentialCreateSchema), credentialsController.create);
router.put('/credentials/:id', validate(credentialIdParamsSchema, 'params'), validate(credentialUpdateSchema), credentialsController.update);
router.delete('/credentials/:id', validate(credentialIdParamsSchema, 'params'), credentialsController.delete);

export default router;
