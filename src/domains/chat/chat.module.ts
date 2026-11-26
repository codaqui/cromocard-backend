import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { createChatRoutes } from './chat.routes';
import { ChatService } from './chat.service';
import { registerChatDocs } from './chat.swagger';
import { ContactsRepository } from './contacts.repository';

export const chatService = new ChatService(
  new ChatRepository(prisma),
  new ContactsRepository(prisma),
);

export const chatModule: DomainModule = {
  basePath: '/me',
  router: createChatRoutes(new ChatController(chatService)),
  registerDocs: registerChatDocs,
};
