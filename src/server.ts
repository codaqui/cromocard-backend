import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { startJobs } from '@/jobs';
import { pingDatabase, prisma } from '@/lib/prisma';

const server = createApp({ pingDatabase, withUploads: true }).listen(env.PORT, () => {
  logger.info(`API rodando em http://localhost:${env.PORT}`);
});

const jobs = env.JOBS_ENABLED ? startJobs() : [];

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} recebido, encerrando a API`);
  jobs.forEach((job) => void job.stop());
  server.close(() => void prisma.$disconnect());
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
