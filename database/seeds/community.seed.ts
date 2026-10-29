import type { PrismaClient } from '@/generated/prisma/client';
import {
  GroupAccessType,
  GroupStatus,
  MemberRole,
  MessageContentType,
  ReportStatus,
  ReportTargetType,
} from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { cardIdOf } from './catalog.seed';
import { loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, optional, SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const groupsSchema = z.array(
  z.object({
    key: seedKey,
    creator: seedKey,
    name: z.string().max(120),
    description: z.string().optional(),
    accessType: z.enum(GroupAccessType),
    status: z.enum(GroupStatus).optional(),
    members: z.array(z.object({ user: seedKey, role: z.enum(MemberRole).optional() })),
  }),
);

const messagesSchema = z.array(
  z.object({
    key: seedKey,
    group: seedKey,
    author: seedKey,
    replyTo: seedKey.optional(),
    card: seedKey.optional(),
    contentType: z.enum(MessageContentType).optional(),
    content: z.string(),
    pinned: z.boolean().default(false),
  }),
);

const reportsSchema = z.array(
  z.object({
    key: seedKey,
    reporter: seedKey,
    moderator: seedKey.optional(),
    targetType: z.enum(ReportTargetType),
    targetUser: seedKey.optional(),
    groupMessage: seedKey.optional(),
    reason: z.string().max(90),
    description: z.string().max(500).optional(),
    status: z.enum(ReportStatus).optional(),
    resolvedAt: z.iso.datetime().optional(),
  }),
);

const groups = loadSeedData('groups.json', groupsSchema);
const messages = loadSeedData('group-messages.json', messagesSchema);
const reports = loadSeedData('reports.json', reportsSchema);

const groupIdOf = keyResolver(SeedNamespace.groups, groups, 'groups.json');
const messageIdOf = keyResolver(SeedNamespace.groupMessages, messages, 'group-messages.json');
export const reportIdOf = keyResolver(SeedNamespace.reports, reports, 'reports.json');

const toGroupMembers = ({ key, members }: (typeof groups)[number]) =>
  members.map(({ user, role }) => ({
    id: seedId(SeedNamespace.groupMembers, `${key}:${user}`),
    groupId: groupIdOf(key),
    userId: userIdOf(user),
    role,
  }));

const toGroupData = ({
  key,
  creator,
  name,
  description,
  accessType,
  status,
}: (typeof groups)[number]) => ({
  id: groupIdOf(key),
  creatorId: userIdOf(creator),
  name,
  description,
  accessType,
  status,
});

async function seedGroups(prisma: PrismaClient) {
  for (const data of groups.map(toGroupData)) {
    await prisma.group.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const member of groups.flatMap(toGroupMembers)) {
    await prisma.groupMember.upsert({ where: { id: member.id }, create: member, update: member });
  }
}

const toMessageData = ({
  key,
  group,
  author,
  replyTo,
  card,
  ...message
}: (typeof messages)[number]) => ({
  ...message,
  id: messageIdOf(key),
  groupId: groupIdOf(group),
  authorId: userIdOf(author),
  replyToId: optional(messageIdOf)(replyTo),
  cardId: optional(cardIdOf)(card),
});

const toReportData = ({
  key,
  reporter,
  moderator,
  targetUser,
  groupMessage,
  resolvedAt,
  ...report
}: (typeof reports)[number]) => ({
  ...report,
  id: reportIdOf(key),
  reporterId: userIdOf(reporter),
  moderatorId: optional(userIdOf)(moderator),
  targetUserId: optional(userIdOf)(targetUser),
  groupMessageId: optional(messageIdOf)(groupMessage),
  resolvedAt: resolvedAt ? new Date(resolvedAt) : undefined,
});

export async function seedCommunity(prisma: PrismaClient): Promise<void> {
  await seedGroups(prisma);
  for (const data of messages.map(toMessageData)) {
    await prisma.groupMessage.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of reports.map(toReportData)) {
    await prisma.report.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
