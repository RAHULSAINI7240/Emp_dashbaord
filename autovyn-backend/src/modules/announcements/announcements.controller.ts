import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { announcementsService } from './announcements.service';

export const announcementsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await announcementsService.create(req.body, req.auth!.userId);
    return sendSuccess(res, 'Announcement created successfully.', data, 201);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const data = await announcementsService.list({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    return sendSuccess(res, 'Announcements fetched successfully.', data);
  })
};
