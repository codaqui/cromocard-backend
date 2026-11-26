import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { ContactResult } from './chat.types';
import type { ContactScope, ContactsQuery } from './chat.validator';

const CONTACTS_LIMIT = 10;

const sharedGroup = (userId: string): Prisma.GroupMemberWhereInput => ({
  ...notDeleted,
  group: { ...notDeleted, members: { some: { userId, ...notDeleted } } },
});

const scopeFilters: Record<ContactScope, (userId: string) => Prisma.UserWhereInput> = {
  all: () => ({}),
  groups: (userId) => ({ groupMemberships: { some: sharedGroup(userId) } }),
  sellers: () => ({ role: 'SELLER' }),
  deals: (userId) => ({
    OR: [{ purchases: { some: { sellerId: userId } } }, { sales: { some: { buyerId: userId } } }],
  }),
};

function reachableBy(userId: string): Prisma.UserWhereInput {
  return {
    ...notDeleted,
    id: { not: userId },
    status: 'ACTIVE',
    role: { not: 'ADMIN' },
    blocksMade: { none: { blockedId: userId, ...notDeleted } },
    blocksReceived: { none: { blockerId: userId, ...notDeleted } },
  };
}

const searchFilter = (q?: string): Prisma.UserWhereInput =>
  q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

const contactSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    username: true,
    role: true,
    sellerVerification: { select: { status: true, deletedAt: true } },
    groupMemberships: { where: sharedGroup(userId), select: { group: { select: { name: true } } } },
  }) satisfies Prisma.UserSelect;

type ContactRow = Prisma.UserGetPayload<{ select: ReturnType<typeof contactSelect> }>;

const toContact = (row: ContactRow): ContactResult => ({
  id: row.id,
  name: row.name,
  username: row.username,
  avatarUrl: null,
  verified:
    row.sellerVerification?.status === 'APPROVED' && row.sellerVerification.deletedAt === null,
  role: row.role,
  commonGroups: row.groupMemberships.map(({ group }) => group.name),
});

export class ContactsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(userId: string, { q, scope }: ContactsQuery): Promise<ContactResult[]> {
    const rows = await this.prisma.user.findMany({
      where: { AND: [reachableBy(userId), searchFilter(q), scopeFilters[scope](userId)] },
      orderBy: { name: 'asc' },
      take: CONTACTS_LIMIT,
      select: contactSelect(userId),
    });
    return rows.map(toContact);
  }

  async isReachable(userId: string, contactId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { AND: [reachableBy(userId), { id: contactId }] },
    });
    return count > 0;
  }
}
