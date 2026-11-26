import { Router } from 'express';

import { parseImageFiles } from '@/domains/uploads/uploads.module';
import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { ContactModerationController } from './contact-moderation.controller';
import { MAX_EVIDENCES } from './contact-moderation.validator';

export function createContactModerationRoutes(controller: ContactModerationController): Router {
  const router = Router();
  const chatUser = [authenticate, authorize('CUSTOMER', 'SELLER')];

  router.get('/blocks', ...chatUser, controller.listBlocks);
  router.post('/blocks', ...chatUser, controller.block);
  router.delete('/blocks/:userId', ...chatUser, controller.unblock);
  router.post(
    '/contact-reports',
    ...chatUser,
    parseImageFiles('evidences', MAX_EVIDENCES),
    controller.report,
  );

  return router;
}
