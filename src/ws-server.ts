// Esqueleto do serviço de tempo real (imagem cromocard-ws). Por enquanto só expõe /health e
// /health/db; o servidor WebSocket da equipe entra aqui (código de apoio em src/socket/).
// Em homologação e produção o Compose define PORT=3001. Localmente: PORT=3001 npm run dev:ws
import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { pingDatabase, prisma } from '@/lib/prisma';

const server = createApp({ pingDatabase }).listen(env.PORT, () => {
  logger.info(`WS rodando em http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} recebido, encerrando o WS`);
  server.close(() => void prisma.$disconnect());
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
