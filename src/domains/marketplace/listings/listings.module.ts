import { prisma } from '@/lib/prisma';

import { PrismaListingsRepository } from './listings.repository';
import { ListingsService } from './listings.service';

export const listingsService = new ListingsService(new PrismaListingsRepository(prisma));

export { ListingsService } from './listings.service';
