import type { SocketHandlers } from './socket.types';

/**
 * Handlers do tempo real de cada domínio, como o `routes.ts` faz com as rotas REST. Cada story acrescenta o seu
 * (ex.: `chatSocketHandlers` na CCD046, `groupMessagesSocketHandlers` na CCD044).
 */
export const socketHandlers: readonly SocketHandlers[] = [];
