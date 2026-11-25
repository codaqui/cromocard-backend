import type { PrismaClient } from '@/generated/prisma/client';
import { z } from '@/lib/zod';

import { loadSeedData, seedKey } from './load-seed-data';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const MINUTE_IN_MS = 60 * 1000;

const chatSchema = z.object({
  conversations: z.array(
    z.object({
      key: seedKey,
      participants: z.tuple([seedKey, seedKey]),
      messages: z.array(
        z.object({
          key: seedKey,
          author: seedKey,
          minutesAgo: z.number().int().min(0),
          content: z.string().min(1).max(2000),
          unread: z.boolean().default(false),
          deleted: z.boolean().default(false),
        }),
      ),
    }),
  ),
  blocks: z.array(z.object({ key: seedKey, blocker: seedKey, blocked: seedKey })),
});

type SeedConversation = z.infer<typeof chatSchema>['conversations'][number];
type SeedMessage = SeedConversation['messages'][number];

const chat = loadSeedData('conversations.json', chatSchema);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * MINUTE_IN_MS);

const toMessageData = (conversationId: string, message: SeedMessage) => {
  const createdAt = minutesAgo(message.minutesAgo);
  return {
    id: seedId(SeedNamespace.messages, message.key),
    conversationId,
    authorId: userIdOf(message.author),
    content: message.content,
    isRead: !message.unread,
    readAt: message.unread ? null : createdAt,
    createdAt,
    deletedAt: message.deleted ? createdAt : null,
  };
};

async function seedConversation(prisma: PrismaClient, conversation: SeedConversation) {
  const id = seedId(SeedNamespace.conversations, conversation.key);
  const createdAt = minutesAgo(Math.max(...conversation.messages.map((m) => m.minutesAgo)) + 1);
  await prisma.conversation.upsert({ where: { id }, create: { id, createdAt }, update: {} });
  for (const userId of conversation.participants.map(userIdOf)) {
    const key = { conversationId_userId: { conversationId: id, userId } };
    await prisma.conversationParticipant.upsert({
      where: key,
      create: { conversationId: id, userId, createdAt },
      update: { deletedAt: null },
    });
  }
  for (const data of conversation.messages.map((message) => toMessageData(id, message))) {
    await prisma.message.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

export async function seedChat(prisma: PrismaClient): Promise<void> {
  for (const conversation of chat.conversations) await seedConversation(prisma, conversation);
  for (const { key, blocker, blocked } of chat.blocks) {
    const data = {
      id: seedId(SeedNamespace.userBlocks, key),
      blockerId: userIdOf(blocker),
      blockedId: userIdOf(blocked),
    };
    await prisma.userBlock.upsert({
      where: { id: data.id },
      create: data,
      update: { deletedAt: null },
    });
  }
}
