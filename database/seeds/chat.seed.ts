import type { PrismaClient } from '@/generated/prisma/client';
import { ReportTargetType } from '@/generated/prisma/enums';
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
          replyTo: seedKey.optional(),
        }),
      ),
    }),
  ),
  blocks: z.array(z.object({ key: seedKey, blocker: seedKey, blocked: seedKey })),
  reports: z.array(
    z.object({
      key: seedKey,
      reporter: seedKey,
      target: seedKey,
      reason: z.string().max(90),
      description: z.string().max(500),
    }),
  ),
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
    replyToId: message.replyTo ? seedId(SeedNamespace.messages, message.replyTo) : null,
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

export async function seedChatReports(prisma: PrismaClient, evidenceUrl?: string): Promise<void> {
  if (!evidenceUrl) return;
  for (const { key, reporter, target, reason, description } of chat.reports) {
    const id = seedId(SeedNamespace.contactReports, key);
    const data = {
      id,
      reporterId: userIdOf(reporter),
      targetUserId: userIdOf(target),
      targetType: ReportTargetType.USER,
      reason,
      description,
    };
    await prisma.report.upsert({ where: { id }, create: data, update: data });
    const evidence = {
      id: seedId(SeedNamespace.reportEvidences, key),
      reportId: id,
      url: evidenceUrl,
    };
    await prisma.reportEvidence.upsert({
      where: { id: evidence.id },
      create: evidence,
      update: evidence,
    });
  }
}
