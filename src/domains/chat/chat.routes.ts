import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { ChatController } from './chat.controller';

export function createChatRoutes(controller: ChatController): Router {
  const router = Router();
  const chatUser = [authenticate, authorize('CUSTOMER', 'SELLER')];

  router.get('/conversations', ...chatUser, controller.list);
  router.post('/conversations', ...chatUser, controller.start);
  router.get('/conversations/:id/messages', ...chatUser, controller.messages);
  router.post('/conversations/:id/read', ...chatUser, controller.read);
  router.get('/contacts', ...chatUser, controller.contacts);

  return router;
}
