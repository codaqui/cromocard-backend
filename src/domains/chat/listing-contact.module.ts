import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { ChatRepository } from './chat.repository';
import { ContactsRepository } from './contacts.repository';
import { ListingContactController } from './listing-contact.controller';
import { ListingContactRepository } from './listing-contact.repository';
import { createListingContactRoutes } from './listing-contact.routes';
import { ListingContactService } from './listing-contact.service';
import { registerListingContactDocs } from './listing-contact.swagger';

const service = new ListingContactService({
  listings: new ListingContactRepository(prisma),
  contacts: new ContactsRepository(prisma),
  conversations: new ChatRepository(prisma),
});

export const listingContactModule: DomainModule = {
  basePath: '/listings',
  router: createListingContactRoutes(new ListingContactController(service)),
  registerDocs: registerListingContactDocs,
};
