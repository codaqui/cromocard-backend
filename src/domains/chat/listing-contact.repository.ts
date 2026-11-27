import type { PrismaClient } from '@/generated/prisma/client';
import type { ListingStatus } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';

export interface ContactListing {
  sellerId: string;
  status: ListingStatus;
}

export class ListingContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findListing(id: string): Promise<ContactListing | null> {
    return this.prisma.listing.findFirst({
      where: { id, ...notDeleted },
      select: { sellerId: true, status: true },
    });
  }

  async hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const count = await this.prisma.userBlock.count({
      where: { blockerId, blockedId, ...notDeleted },
    });
    return count > 0;
  }
}
