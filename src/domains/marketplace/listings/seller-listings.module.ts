import { connectedAccountsService } from '@/domains/marketplace/payments/payments.module';
import { usersService } from '@/domains/users/users.module';
import { runInTransaction } from '@/lib/transaction';
import { createStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { createOwnListingPhotoPolicy } from './listing-photos';
import { SellerListingsController } from './seller-listings.controller';
import { PrismaSellerListingsRepository } from './seller-listings.repository';
import { createSellerListingsRoutes } from './seller-listings.routes';
import { SellerListingsService } from './seller-listings.service';
import { registerSellerListingsDocs } from './seller-listings.swagger';

const storage = createStorageProvider();

const sellerListingsService = new SellerListingsService({
  repository: new PrismaSellerListingsRepository(),
  sellerAccounts: connectedAccountsService,
  sellerAddresses: usersService,
  isOwnListingPhoto: createOwnListingPhotoPolicy((key) => storage.getUrl(key)),
  runInTransaction,
});

export const sellerListingsModule: DomainModule = {
  basePath: '/me/listings',
  router: createSellerListingsRoutes(new SellerListingsController(sellerListingsService)),
  registerDocs: registerSellerListingsDocs,
};
