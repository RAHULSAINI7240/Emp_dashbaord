import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { policiesService } from './policies.service';

export const policiesController = {
  upsert: asyncHandler(async (req: Request, res: Response) => {
    const data = await policiesService.upsert(req.body, req.auth!.userId);
    return sendSuccess(res, 'Policies updated successfully.', data, 201);
  }),

  latest: asyncHandler(async (_req: Request, res: Response) => {
    const data = await policiesService.getLatest();
    return sendSuccess(res, 'Policies fetched successfully.', data);
  })
};
