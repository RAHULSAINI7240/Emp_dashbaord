import { app } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';

let server: ReturnType<typeof app.listen>;

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
    return;
  }

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

const start = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('Connected to database.');

    server = app.listen(env.PORT, () => {
      console.log(`Autovyn backend listening on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to database.', error);
    process.exit(1);
  }
};

void start();
