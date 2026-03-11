import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { credentialsService } from './credentials.service';

export const credentialsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const data = await credentialsService.list(req.auth!);
    return sendSuccess(res, 'Credentials fetched successfully.', data);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await credentialsService.create(req.body, req.auth!);
    return sendSuccess(res, 'Credential created successfully.', data, 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const data = await credentialsService.update(req.params.id, req.body, req.auth!);
    return sendSuccess(res, 'Credential updated successfully.', data);
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const data = await credentialsService.delete(req.params.id, req.auth!);
    return sendSuccess(res, 'Credential deleted successfully.', data);
  })
};
