import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';

import { env } from '@/config/env';

import { authenticateSocket } from './socket-auth.middleware';
import { userRoom } from './socket-rooms';
import type { AppSocketServer, SocketHandlers } from './socket.types';

export interface SocketServerOptions {
  handlers?: readonly SocketHandlers[];
}

export function createSocketServer(
  httpServer: HttpServer,
  { handlers = [] }: SocketServerOptions = {},
): AppSocketServer {
  const io: AppSocketServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    void socket.join(userRoom(socket.data.user.id));
    handlers.forEach((register) => {
      register(io, socket);
    });
  });

  return io;
}
