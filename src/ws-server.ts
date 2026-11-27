// Em homologação e produção o Compose define PORT=3001. Localmente: PORT=3001 npm run dev:ws
import { createServer } from 'node:http';

import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { pingDatabase, prisma } from '@/lib/prisma';
import { socketHandlers } from '@/socket/socket-handlers';
import { createSocketServer } from '@/socket/socket-server';

const server = createServer(createApp({ pingDatabase }));
const io = createSocketServer(server, { handlers: socketHandlers });

server.listen(env.PORT, () => {
  logger.info(`WS rodando em http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} recebido, encerrando o WS`);
  void io.close(() => void prisma.$disconnect());
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
