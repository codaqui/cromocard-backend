import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { ListingContactController } from './listing-contact.controller';

export function createListingContactRoutes(controller: ListingContactController): Router {
  const router = Router();

  router.post('/:id/contact', authenticate, authorize('CUSTOMER', 'SELLER'), controller.contact);

  return router;
}
