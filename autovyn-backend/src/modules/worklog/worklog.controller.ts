import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { worklogService } from './worklog.service';
import { worklogLiveState } from './worklog.live';

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

  presence: asyncHandler(async (req: Request, res: Response) => {
    const data = await worklogService.presence(req.auth!, {
      status: req.body.status,
      recordedAt: req.body.recordedAt,
      deviceId: req.body.deviceId,
      editor: req.body.editor,
      isFocused: req.body.isFocused
    });

    return sendSuccess(res, 'Work presence updated successfully.', data, 200);
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
  }),

  stream(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writePresence = (presence: ReturnType<typeof worklogLiveState.getPresence> extends infer T ? Exclude<T, undefined> : never) => {
      if (presence.userId !== req.auth!.userId) {
        return;
      }

      res.write(`event: presence\n`);
      res.write(`data: ${JSON.stringify(presence)}\n\n`);
    };

    const existing = worklogLiveState.getPresence(req.auth!.userId);
    if (existing) {
      writePresence(existing);
    } else {
      res.write(`event: ready\ndata: ${JSON.stringify({ userId: req.auth!.userId })}\n\n`);
    }

    const unsubscribe = worklogLiveState.subscribe(writePresence);
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });
  }
};
