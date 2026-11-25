import type { PrismaClient } from '@/generated/prisma/client';
import type { StripeAccountStatus } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';

const sellerAccountSelect = {
  email: true,
  stripeAccountId: true,
  stripeAccountStatus: true,
} as const;

export interface SellerAccount {
  email: string;
  stripeAccountId: string | null;
  stripeAccountStatus: StripeAccountStatus | null;
}

export interface ConnectedAccountsRepository {
  findSeller(sellerId: string): Promise<SellerAccount | null>;
  linkAccount(sellerId: string, stripeAccountId: string): Promise<void>;
  saveStatus(sellerId: string, status: StripeAccountStatus): Promise<void>;
  saveStatusByAccount(stripeAccountId: string, status: StripeAccountStatus): Promise<number>;
}

export class PrismaConnectedAccountsRepository implements ConnectedAccountsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findSeller(sellerId: string): Promise<SellerAccount | null> {
    return this.prisma.user.findFirst({
      where: { id: sellerId, ...notDeleted },
      select: sellerAccountSelect,
    });
  }

  async linkAccount(sellerId: string, stripeAccountId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: sellerId },
      data: { stripeAccountId, stripeAccountStatus: 'PENDING' },
    });
  }

  async saveStatus(sellerId: string, stripeAccountStatus: StripeAccountStatus): Promise<void> {
    await this.prisma.user.update({ where: { id: sellerId }, data: { stripeAccountStatus } });
  }

  async saveStatusByAccount(
    stripeAccountId: string,
    stripeAccountStatus: StripeAccountStatus,
  ): Promise<number> {
    const { count } = await this.prisma.user.updateMany({
      where: { stripeAccountId },
      data: { stripeAccountStatus },
    });
    return count;
  }
}
