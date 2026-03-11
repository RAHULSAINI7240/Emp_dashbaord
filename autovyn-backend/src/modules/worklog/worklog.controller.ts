import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { worklogService } from './worklog.service';

export const worklogController = {
  heartbeat: asyncHandler(async (req: Request, res: Response) => {
    const data = await worklogService.heartbeat(req.auth!, {
      status: req.body.status,
      durationSeconds: req.body.durationSeconds,
      recordedAt: req.body.recordedAt,
      deviceId: req.body.deviceId,
      editor: req.body.editor,
      isFocused: req.body.isFocused
    });

    return sendSuccess(res, 'Work heartbeat recorded successfully.', data, 201);
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const timezoneOffsetMinutes =
      req.query.timezoneOffsetMinutes !== undefined
        ? Number(req.query.timezoneOffsetMinutes)
        : (req.timezoneOffsetMinutes ?? 0);

    const data = await worklogService.summary(
      req.auth!,
      {
        from: req.query.from as string,
        to: req.query.to as string,
        employeeId: req.query.employeeId as string | undefined,
        userId: req.query.userId as string | undefined
      },
      timezoneOffsetMinutes
    );

    return sendSuccess(res, 'Worklog summary fetched successfully.', data);
  })
};
