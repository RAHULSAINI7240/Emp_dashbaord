import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { screenshotsLiveState } from './screenshots.live';

interface UploadInput {
  userId: string;
  imageData: string;
  deviceId?: string;
  capturedAt: string;
}

interface ListInput {
  userId: string;
  dateStart: Date;
  dateEnd: Date;
}

interface StoredScreenshot {
  id: string;
  userId: string;
  imageData: string;
  deviceId: string | null;
  capturedAt: Date;
}

const SCREENSHOT_RETENTION_MS = env.SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const RETENTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let retentionSweepPromise: Promise<void> | null = null;
let lastRetentionSweepStartedAt = 0;

const retentionCutoff = () => new Date(Date.now() - SCREENSHOT_RETENTION_MS);

const screenshotSelect = {
  id: true,
  userId: true,
  imageData: true,
  deviceId: true,
  capturedAt: true
} as const;

const publishLiveItems = (items: StoredScreenshot[]) => {
  screenshotsLiveState.publish(
    items.map((item) => ({
      id: item.id,
      userId: item.userId,
      imageData: item.imageData,
      deviceId: item.deviceId,
      capturedAt: item.capturedAt.toISOString()
    }))
  );
};

const sweepExpiredScreenshots = async () => {
  const now = Date.now();
  if (retentionSweepPromise) {
    return retentionSweepPromise;
  }

  if (now - lastRetentionSweepStartedAt < RETENTION_SWEEP_INTERVAL_MS) {
    return;
  }

  lastRetentionSweepStartedAt = now;
  retentionSweepPromise = prisma.screenshot
    .deleteMany({
      where: {
        capturedAt: {
          lt: retentionCutoff()
        }
      }
    })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      retentionSweepPromise = null;
    });

  await retentionSweepPromise;
};

export const screenshotsService = {
  async upload(input: UploadInput) {
    await sweepExpiredScreenshots();

    const created = await prisma.screenshot.create({
      data: {
        userId: input.userId,
        imageData: input.imageData,
        deviceId: input.deviceId ?? null,
        capturedAt: new Date(input.capturedAt)
      },
      select: screenshotSelect
    });

    publishLiveItems([created]);
    return created;
  },

  async uploadBatch(userId: string, items: Omit<UploadInput, 'userId'>[]) {
    await sweepExpiredScreenshots();

    const data = items.map((item) => ({
      userId,
      imageData: item.imageData,
      deviceId: item.deviceId ?? null,
      capturedAt: new Date(item.capturedAt)
    })).filter((item) => item.capturedAt >= retentionCutoff());

    if (!data.length) {
      return [];
    }

    const created = await Promise.all(
      data.map((item) =>
        prisma.screenshot.create({
          data: item,
          select: screenshotSelect
        })
      )
    );

    publishLiveItems(created);
    return created;
  },

  async listByUserAndDate(input: ListInput) {
    await sweepExpiredScreenshots();

    return prisma.screenshot.findMany({
      where: {
        userId: input.userId,
        capturedAt: {
          gte: input.dateStart,
          lt: input.dateEnd
        }
      },
      select: {
        id: true,
        imageData: true,
        deviceId: true,
        capturedAt: true
      },
      orderBy: { capturedAt: 'desc' }
    });
  },

  async listRecentByUser(userId: string, days: number) {
    await sweepExpiredScreenshots();

    const clampedDays = Math.max(1, Math.min(days, env.SCREENSHOT_RETENTION_DAYS));

    return prisma.screenshot.findMany({
      where: {
        userId,
        capturedAt: {
          gte: new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        id: true,
        imageData: true,
        deviceId: true,
        capturedAt: true
      },
      orderBy: { capturedAt: 'desc' }
    });
  },

  async latestByUserAndDate(input: { userId: string; dateStart: Date; dateEnd: Date; afterId?: string }) {
    await sweepExpiredScreenshots();

    const where: Record<string, unknown> = {
      userId: input.userId,
      capturedAt: {
        gte: input.dateStart,
        lt: input.dateEnd
      }
    };

    if (input.afterId) {
      where.id = { gt: input.afterId };
    }

    return prisma.screenshot.findMany({
      where,
      select: {
        id: true,
        imageData: true,
        deviceId: true,
        capturedAt: true
      },
      orderBy: { capturedAt: 'desc' }
    });
  }
};
