import { app } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { bootstrapStartupUsers } from './bootstrap/demo-user';

let server: ReturnType<typeof app.listen>;
let isShuttingDown = false;

const disconnectPrisma = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to disconnect database client cleanly.', error);
  }
};

const exitWithStartupError = async (error: NodeJS.ErrnoException): Promise<never> => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.PORT} is already in use. Stop the other process using that port or set PORT in autovyn-backend/.env to a different value.`
    );
  } else {
    console.error('Failed to start HTTP server.', error);
  }

  await disconnectPrisma();
  process.exit(1);
};

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  if (!server) {
    await disconnectPrisma();
    process.exit(0);
    return;
  }

  server.close(async () => {
    await disconnectPrisma();
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
    await bootstrapStartupUsers();

    server = app.listen(env.PORT, () => {
      console.log(`Autovyn backend listening on port ${env.PORT}`);
    });

    server.once('error', (error: NodeJS.ErrnoException) => {
      void exitWithStartupError(error);
    });
  } catch (error) {
    console.error('Failed to initialize backend.', error);
    await disconnectPrisma();
    process.exit(1);
  }
};

void start();
