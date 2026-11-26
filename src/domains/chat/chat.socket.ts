import { logger } from '@/config/logger';
import { withAck } from '@/socket/socket-ack';
import { userRoom } from '@/socket/socket-rooms';
import type { AppSocket, AppSocketServer, SocketHandlers } from '@/socket/socket.types';

import type { ChatService } from './chat.service';
import { conversationRoomSchema, presenceListSchema, sendMessageSchema } from './chat.validator';
import type { PresenceRegistry } from './presence.registry';

export type ChatSocketService = Pick<
  ChatService,
  'conversationOf' | 'sendMessage' | 'listPartnerIds'
>;

export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

function registerRooms(socket: AppSocket, service: ChatSocketService) {
  const userId = socket.data.user.id;
  socket.on(
    'conversation:join',
    withAck(async (payload: unknown) => {
      const { conversationId } = conversationRoomSchema.parse(payload);
      await service.conversationOf(userId, conversationId);
      await socket.join(conversationRoom(conversationId));
      return { conversationId };
    }),
  );
  socket.on(
    'conversation:leave',
    withAck(async (payload: unknown) => {
      const { conversationId } = conversationRoomSchema.parse(payload);
      await socket.leave(conversationRoom(conversationId));
      return { conversationId };
    }),
  );
}

function registerMessages(io: AppSocketServer, socket: AppSocket, service: ChatSocketService) {
  const userId = socket.data.user.id;
  socket.on(
    'message:send',
    withAck(async (payload: unknown) => {
      const { message, recipientId } = await service.sendMessage(
        userId,
        sendMessageSchema.parse(payload),
      );
      const rooms = [
        conversationRoom(message.conversationId),
        userRoom(userId),
        userRoom(recipientId),
      ];
      io.to(rooms).emit('message:new', message);
      return message;
    }),
  );
}

type PresenceChange = { userId: string; online: boolean };

async function emitPresence(
  io: AppSocketServer,
  service: ChatSocketService,
  change: PresenceChange,
) {
  const partners = await service.listPartnerIds(change.userId);
  if (partners.length > 0) io.to(partners.map(userRoom)).emit('presence:changed', change);
}

function announce(io: AppSocketServer, service: ChatSocketService, change: PresenceChange) {
  return emitPresence(io, service, change).catch((error: unknown) => {
    logger.warn({ err: error, userId: change.userId }, 'Não foi possível avisar a presença');
  });
}

function registerPresence(io: AppSocketServer, socket: AppSocket, deps: ChatSocketDeps) {
  const userId = socket.data.user.id;
  if (deps.presence.connect(userId)) void announce(io, deps.service, { userId, online: true });
  socket.on('disconnect', () => {
    if (deps.presence.disconnect(userId))
      void announce(io, deps.service, { userId, online: false });
  });
  socket.on(
    'presence:list',
    withAck(async (payload: unknown) => {
      const { userIds } = presenceListSchema.parse(payload);
      return Promise.resolve({ online: deps.presence.onlineAmong(userIds) });
    }),
  );
}

export interface ChatSocketDeps {
  service: ChatSocketService;
  presence: PresenceRegistry;
}

export function createChatSocketHandlers(deps: ChatSocketDeps): SocketHandlers {
  return (io, socket) => {
    registerRooms(socket, deps.service);
    registerMessages(io, socket, deps.service);
    registerPresence(io, socket, deps);
  };
}
