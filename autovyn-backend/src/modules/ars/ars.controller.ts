import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { arsService } from './ars.service';

export const arsController = {
  request: asyncHandler(async (req: Request, res: Response) => {
    const data = await arsService.request(req.auth!, req.body);
    return sendSuccess(res, 'ARS request created successfully.', data, 201);
  }),

  my: asyncHandler(async (req: Request, res: Response) => {
    const data = await arsService.my(req.auth!, {
      status: req.query.status as never,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'My ARS requests fetched successfully.', data);
  }),

  pendingApprovals: asyncHandler(async (req: Request, res: Response) => {
    const data = await arsService.pendingApprovals(req.auth!, {
      status: req.query.status as never,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'Pending ARS approvals fetched successfully.', data);
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    const data = await arsService.approve(req.auth!, req.params.id, req.body);
    return sendSuccess(res, 'ARS request approved successfully.', data);
  }),

  decline: asyncHandler(async (req: Request, res: Response) => {
    const data = await arsService.decline(req.auth!, req.params.id, req.body.comment);
    return sendSuccess(res, 'ARS request declined successfully.', data);
  })
};
