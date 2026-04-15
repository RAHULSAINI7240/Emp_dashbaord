import { prisma } from '../../db/prisma';

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

export const screenshotsService = {
  async upload(input: UploadInput) {
    return prisma.screenshot.create({
      data: {
        userId: input.userId,
        imageData: input.imageData,
        deviceId: input.deviceId ?? null,
        capturedAt: new Date(input.capturedAt)
      },
      select: {
        id: true,
        capturedAt: true
      }
    });
  },

  async listByUserAndDate(input: ListInput) {
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

  async latestByUserAndDate(input: { userId: string; dateStart: Date; dateEnd: Date; afterId?: string }) {
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
