import { prisma } from '@/lib/prisma';
import { createStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { SellerListingsController } from './seller-listings.controller';
import { PrismaSellerListingsRepository } from './seller-listings.repository';
import { createSellerListingsRoutes } from './seller-listings.routes';
import { SellerListingsService } from './seller-listings.service';
import { registerSellerListingsDocs } from './seller-listings.swagger';

const listingPhotosBaseUrl = createStorageProvider().getUrl('listings/');

const sellerListingsService = new SellerListingsService({
  repository: new PrismaSellerListingsRepository(prisma),
  isListingPhotoUrl: (url) => url.startsWith(listingPhotosBaseUrl),
});

export const sellerListingsModule: DomainModule = {
  basePath: '/me/listings',
  router: createSellerListingsRoutes(new SellerListingsController(sellerListingsService)),
  registerDocs: registerSellerListingsDocs,
};
