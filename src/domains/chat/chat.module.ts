import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { createChatRoutes } from './chat.routes';
import { ChatService } from './chat.service';
import { createChatSocketHandlers } from './chat.socket';
import { registerChatDocs } from './chat.swagger';
import { ContactsRepository } from './contacts.repository';
import { PresenceRegistry } from './presence.registry';

export const chatService = new ChatService(
  new ChatRepository(prisma),
  new ContactsRepository(prisma),
  notificationsService,
);

export const chatModule: DomainModule = {
  basePath: '/me',
  router: createChatRoutes(new ChatController(chatService)),
  registerDocs: registerChatDocs,
};

export const chatSocketHandlers = createChatSocketHandlers({
  service: chatService,
  presence: new PresenceRegistry(),
});
