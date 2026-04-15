import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
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

    return sendSuccess(res, 'Screenshot uploaded.', data, 201);
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

  stream(req: Request, res: Response) {
    const userId = req.query.userId as string;
    const date = req.query.date as string;

    if (!userId || !date) {
      res.status(400).json({ message: 'userId and date are required.' });
      return;
    }

    const { dateStart, dateEnd } = dateRange(date);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let lastId: string | undefined;

    const poll = async () => {
      try {
        const items = await screenshotsService.latestByUserAndDate({
          userId,
          dateStart,
          dateEnd,
          afterId: lastId
        });

        if (items.length > 0) {
          lastId = items[0].id;
          res.write(`event: screenshots\n`);
          res.write(`data: ${JSON.stringify(items)}\n\n`);
        }
      } catch {
        // keep stream alive even if a single poll fails
      }
    };

    void poll();
    const intervalHandle = setInterval(poll, 15_000);
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 20_000);

    req.on('close', () => {
      clearInterval(intervalHandle);
      clearInterval(keepAlive);
      res.end();
    });
  }
};
