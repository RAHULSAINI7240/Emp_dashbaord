import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { attendanceService } from './attendance.service';

export const attendanceController = {
  punchIn: asyncHandler(async (req: Request, res: Response) => {
    const timezoneOffsetMinutes = (req.body.timezoneOffsetMinutes as number | undefined) ?? req.timezoneOffsetMinutes ?? 0;
    const data = await attendanceService.punchIn(req.auth!, timezoneOffsetMinutes);
    return sendSuccess(res, 'Punch-in successful.', data);
  }),

  punchOut: asyncHandler(async (req: Request, res: Response) => {
    const timezoneOffsetMinutes = (req.body.timezoneOffsetMinutes as number | undefined) ?? req.timezoneOffsetMinutes ?? 0;
    const data = await attendanceService.punchOut(req.auth!, timezoneOffsetMinutes);
    return sendSuccess(res, 'Punch-out successful.', data);
  }),

  month: asyncHandler(async (req: Request, res: Response) => {
    const month = req.query.month as string;
    const timezoneOffsetMinutes =
      req.query.timezoneOffsetMinutes !== undefined
        ? Number(req.query.timezoneOffsetMinutes)
        : (req.timezoneOffsetMinutes ?? 0);
    const data = await attendanceService.getMonth(req.auth!, month, timezoneOffsetMinutes);
    return sendSuccess(res, 'Monthly attendance fetched successfully.', data);
  }),

  day: asyncHandler(async (req: Request, res: Response) => {
    const date = req.query.date as string;
    const timezoneOffsetMinutes =
      req.query.timezoneOffsetMinutes !== undefined
        ? Number(req.query.timezoneOffsetMinutes)
        : (req.timezoneOffsetMinutes ?? 0);
    const data = await attendanceService.getDay(req.auth!, date, timezoneOffsetMinutes);
    return sendSuccess(res, 'Day attendance fetched successfully.', data);
  }),

  report: asyncHandler(async (req: Request, res: Response) => {
    const timezoneOffsetMinutes =
      req.query.timezoneOffsetMinutes !== undefined
        ? Number(req.query.timezoneOffsetMinutes)
        : (req.timezoneOffsetMinutes ?? 0);

    const data = await attendanceService.report(
      req.auth!,
      {
        from: req.query.from as string,
        to: req.query.to as string,
        employeeId: req.query.employeeId as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      },
      timezoneOffsetMinutes
    );
    return sendSuccess(res, 'Attendance report fetched successfully.', data);
  })
};
