import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CatalogController } from './catalog.controller';

export function createCatalogRoutes(controller: CatalogController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));

  router.get('/albums', controller.listAlbums);
  router.post('/albums', controller.createAlbum);
  router.patch('/albums/:id', controller.updateAlbum);
  router.delete('/albums/:id', controller.deleteAlbum);

  router.get('/cards', controller.listCards);
  router.post('/cards', controller.createCard);
  router.patch('/cards/:id', controller.updateCard);
  router.delete('/cards/:id', controller.deleteCard);

  router.get('/categories', controller.listCategories);
  router.post('/categories', controller.createCategory);
  router.patch('/categories/:id', controller.updateCategory);
  router.delete('/categories/:id', controller.deleteCategory);

  router.get('/rarities', controller.listRarities);
  router.get('/languages', controller.listLanguages);

  return router;
}
