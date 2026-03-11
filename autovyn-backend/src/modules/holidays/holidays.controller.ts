import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { holidaysService } from './holidays.service';

export const holidaysController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await holidaysService.create(req.body, req.auth!.userId);
    return sendSuccess(res, 'Holiday created successfully.', data, 201);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const data = await holidaysService.listByYear(Number(req.query.year));
    return sendSuccess(res, 'Holidays fetched successfully.', data);
  })
};
