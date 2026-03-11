import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { leavesService } from './leaves.service';

export const leavesController = {
  request: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.requestLeave(req.auth!, req.body);
    return sendSuccess(res, 'Leave request created successfully.', data, 201);
  }),

  my: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.myLeaves(req.auth!, {
      status: req.query.status as never,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'My leave requests fetched successfully.', data);
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.summary(req.auth!);
    return sendSuccess(res, 'Leave summary fetched successfully.', data);
  }),

  approvers: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.approvers(req.auth!);
    return sendSuccess(res, 'Eligible leave approvers fetched successfully.', data);
  }),

  pendingApprovals: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.pendingApprovals(req.auth!, {
      status: req.query.status as never,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'Pending leave approvals fetched successfully.', data);
  }),

  approvalHistory: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.approvalHistory(req.auth!, {
      status: req.query.status as never,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'Leave approval history fetched successfully.', data);
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.approve(req.auth!, req.params.id, req.body.comment);
    return sendSuccess(res, 'Leave request approved successfully.', data);
  }),

  decline: asyncHandler(async (req: Request, res: Response) => {
    const data = await leavesService.decline(req.auth!, req.params.id, req.body.comment);
    return sendSuccess(res, 'Leave request declined successfully.', data);
  })
};
