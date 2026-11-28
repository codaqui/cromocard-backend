import type { Server as HttpServer } from 'node:http';

import { Server, type ServerOptions } from 'socket.io';

import { env } from '@/config/env';

import { authenticateSocket } from './socket-auth.middleware';
import { userRoom } from './socket-rooms';
import { disconnectWhenTokenExpires } from './socket-session';
import type { AppSocketServer, SocketHandlers } from './socket.types';

export interface SocketServerOptions {
  handlers?: readonly SocketHandlers[];
  adapter?: ServerOptions['adapter'];
}

export function createSocketServer(
  httpServer: HttpServer,
  { handlers = [], adapter }: SocketServerOptions = {},
): AppSocketServer {
  const io: AppSocketServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
    ...(adapter && { adapter }),
  });

  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    void socket.join(userRoom(socket.data.user.id));
    disconnectWhenTokenExpires(socket);
    handlers.forEach((register) => {
      register(io, socket);
    });
  });

  return io;
}
