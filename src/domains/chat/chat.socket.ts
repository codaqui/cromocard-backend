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

async function emitPresence(io: AppSocketServer, deps: ChatSocketDeps, userId: string) {
  const partners = await deps.service.listPartnerIds(userId);
  const change = { userId, online: deps.presence.isOnline(userId) };
  if (partners.length > 0) io.to(partners.map(userRoom)).emit('presence:changed', change);
}

function announce(io: AppSocketServer, deps: ChatSocketDeps, userId: string) {
  return emitPresence(io, deps, userId).catch((error: unknown) => {
    logger.warn({ err: error, userId }, 'Não foi possível avisar a presença');
  });
}

async function onlinePartnersAmong(deps: ChatSocketDeps, userId: string, userIds: string[]) {
  const partners = new Set(await deps.service.listPartnerIds(userId));
  return deps.presence.onlineAmong(userIds.filter((id) => partners.has(id)));
}

function registerPresence(io: AppSocketServer, socket: AppSocket, deps: ChatSocketDeps) {
  const userId = socket.data.user.id;
  if (deps.presence.connect(userId)) void announce(io, deps, userId);
  socket.on('disconnect', () => {
    if (deps.presence.disconnect(userId)) void announce(io, deps, userId);
  });
  socket.on(
    'presence:list',
    withAck(async (payload: unknown) => {
      const { userIds } = presenceListSchema.parse(payload);
      return { online: await onlinePartnersAmong(deps, userId, userIds) };
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
