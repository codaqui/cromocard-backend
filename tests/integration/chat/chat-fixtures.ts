import type { Prisma } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const MINUTE_IN_MS = 60 * 1000;

export interface TestUser {
  id: string;
  token: string;
}

export interface TestMessage {
  conversationId: string;
  author: TestUser;
  content: string;
  minutesAgo?: number;
  isRead?: boolean;
  deleted?: boolean;
}

export class ChatFixtures {
  private readonly userIds: string[] = [];

  constructor(private readonly marker: string) {}

  async createUser(
    key: string,
    role: UserRole = 'CUSTOMER',
    data: Partial<Prisma.UserCreateInput> = {},
  ) {
    const { marker } = this;
    const user = await prisma.user.create({
      data: {
        name: `${marker} ${key}`,
        email: `${marker}-${key}@cromocard.dev`,
        username: `${marker}_${key}`,
        role,
        ...data,
      },
    });
    this.userIds.push(user.id);
    return { id: user.id, token: signAccessToken({ id: user.id, role }) };
  }

  async createConversation(a: TestUser, b: TestUser) {
    const conversation = await prisma.conversation.create({
      data: { participants: { create: [{ userId: a.id }, { userId: b.id }] } },
    });
    return conversation.id;
  }

  say({
    conversationId,
    author,
    content,
    minutesAgo = 0,
    isRead = false,
    deleted = false,
  }: TestMessage) {
    const createdAt = new Date(Date.now() - minutesAgo * MINUTE_IN_MS);
    return prisma.message.create({
      data: {
        conversationId,
        authorId: author.id,
        content,
        isRead,
        createdAt,
        deletedAt: deleted ? createdAt : null,
      },
    });
  }

  async cleanup() {
    const userIds = { in: this.userIds };
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: userIds } } },
      select: { id: true },
    });
    const ids = { in: conversations.map(({ id }) => id) };
    await prisma.message.deleteMany({ where: { conversationId: ids } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: ids } });
    await prisma.conversation.deleteMany({ where: { id: ids } });
    await prisma.userBlock.deleteMany({
      where: { OR: [{ blockerId: userIds }, { blockedId: userIds }] },
    });
    await prisma.notification.deleteMany({ where: { userId: userIds } });
    await prisma.notificationPreference.deleteMany({ where: { userId: userIds } });
    await prisma.profile.deleteMany({ where: { userId: userIds } });
    await prisma.user.deleteMany({ where: { id: userIds } });
  }
}
