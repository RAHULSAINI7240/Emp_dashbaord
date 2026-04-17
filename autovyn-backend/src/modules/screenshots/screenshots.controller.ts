import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { env } from '../../config/env';
import { screenshotsLiveState, type LiveScreenshot } from './screenshots.live';
import { screenshotsService } from './screenshots.service';

const dateRange = (dateString: string) => {
  const dateStart = new Date(`${dateString}T00:00:00.000Z`);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
  return { dateStart, dateEnd };
};

export const screenshotsController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    const data = await screenshotsService.upload({
      userId: req.auth!.userId,
      imageData: req.body.imageData,
      deviceId: req.body.deviceId,
      capturedAt: req.body.capturedAt
    });

    return sendSuccess(res, 'Screenshot uploaded.', {
      id: data.id,
      capturedAt: data.capturedAt.toISOString()
    }, 201);
  }),

  uploadBatch: asyncHandler(async (req: Request, res: Response) => {
    const items = await screenshotsService.uploadBatch(
      req.auth!.userId,
      req.body.screenshots
    );

    return sendSuccess(res, `${items.length} screenshots uploaded.`, { count: items.length }, 201);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const date = req.query.date as string;
    const { dateStart, dateEnd } = dateRange(date);

    const screenshots = await screenshotsService.listByUserAndDate({
      userId,
      dateStart,
      dateEnd
    });

    return sendSuccess(res, 'Screenshots fetched.', screenshots);
  }),

  recent: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const days = Number(req.query.days ?? 2);

    const screenshots = await screenshotsService.listRecentByUser(userId, days);
    return sendSuccess(res, 'Recent screenshots fetched.', screenshots);
  }),

  stream(req: Request, res: Response) {
    const userId = req.query.userId as string;
    const days = Math.max(1, Math.min(Number(req.query.days ?? 2), env.SCREENSHOT_RETENTION_DAYS));
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let closed = false;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeItems = (items: LiveScreenshot[]) => {
      if (closed || res.writableEnded) {
        return;
      }

      const visibleItems = items.filter((item) => {
        if (item.userId !== userId) {
          return false;
        }

        const capturedAtMs = new Date(item.capturedAt).getTime();
        return !Number.isNaN(capturedAtMs) && capturedAtMs >= windowStart.getTime();
      });

      if (!visibleItems.length) {
        return;
      }

      res.write(`event: screenshots\n`);
      res.write(`data: ${JSON.stringify(visibleItems)}\n\n`);
    };

    void screenshotsService.listRecentByUser(userId, days)
      .then((items) => {
        writeItems(items.map((item) => ({
          ...item,
          userId,
          capturedAt: item.capturedAt.toISOString()
        })));
      })
      .catch(() => {
        if (!closed && !res.writableEnded) {
          res.write(`event: ready\ndata: ${JSON.stringify({ userId })}\n\n`);
        }
      });

    const unsubscribe = screenshotsLiveState.subscribe(writeItems);
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15_000);

    req.on('close', () => {
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });
  }
};
