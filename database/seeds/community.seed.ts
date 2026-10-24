import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { SeedCard } from './catalog.seed';
import { SeedNamespace, seedId } from './seed-id';
import { SeedUser } from './users.seed';

const groupId = (index: number) => seedId(SeedNamespace.groups, index);
const memberId = (index: number) => seedId(SeedNamespace.groupMembers, index);
const messageId = (index: number) => seedId(SeedNamespace.groupMessages, index);
const reportId = (index: number) => seedId(SeedNamespace.reports, index);

const SeedGroup = {
  worldCupTraders: groupId(1),
  pokemonMasters: groupId(2),
  magicVeterans: groupId(3),
} as const;

const groups: Prisma.GroupCreateManyInput[] = [
  {
    id: SeedGroup.worldCupTraders,
    creatorId: SeedUser.ana,
    name: 'Trocas da Copa 2026',
    description: 'Grupo para completar o álbum da Copa trocando repetidas.',
    accessType: 'OPEN',
  },
  {
    id: SeedGroup.pokemonMasters,
    creatorId: SeedUser.bruno,
    name: 'Mestres Pokémon',
    description: 'Colecionadores de cartas Pokémon antigas.',
    accessType: 'CLOSED',
  },
  {
    id: SeedGroup.magicVeterans,
    creatorId: SeedUser.diego,
    name: 'Veteranos do Magic',
    accessType: 'OPEN',
    status: 'SUSPENDED',
  },
];

const members: Prisma.GroupMemberCreateManyInput[] = [
  { id: memberId(1), groupId: SeedGroup.worldCupTraders, userId: SeedUser.ana, role: 'ADMIN' },
  { id: memberId(2), groupId: SeedGroup.worldCupTraders, userId: SeedUser.bruno },
  { id: memberId(3), groupId: SeedGroup.worldCupTraders, userId: SeedUser.carla },
  { id: memberId(4), groupId: SeedGroup.worldCupTraders, userId: SeedUser.diego },
  { id: memberId(5), groupId: SeedGroup.pokemonMasters, userId: SeedUser.bruno, role: 'ADMIN' },
  { id: memberId(6), groupId: SeedGroup.pokemonMasters, userId: SeedUser.elisa },
  { id: memberId(7), groupId: SeedGroup.magicVeterans, userId: SeedUser.diego, role: 'ADMIN' },
];

const offensiveMessage = messageId(4);
const spamMessage = messageId(5);

const messages: Prisma.GroupMessageCreateManyInput[] = [
  {
    id: messageId(1),
    groupId: SeedGroup.worldCupTraders,
    authorId: SeedUser.ana,
    content: 'Bem-vindos! Postem aqui as repetidas de vocês.',
    pinned: true,
  },
  {
    id: messageId(2),
    groupId: SeedGroup.worldCupTraders,
    authorId: SeedUser.bruno,
    contentType: 'CARD',
    cardId: SeedCard.neymar,
    content: 'Tenho o Neymar repetido, alguém troca pelo Vini?',
  },
  {
    id: messageId(3),
    groupId: SeedGroup.worldCupTraders,
    authorId: SeedUser.carla,
    replyToId: messageId(2),
    content: 'Eu troco! Te chamo no privado.',
  },
  {
    id: offensiveMessage,
    groupId: SeedGroup.worldCupTraders,
    authorId: SeedUser.diego,
    content: 'Quem não troca comigo é idiota.',
  },
  {
    id: spamMessage,
    groupId: SeedGroup.pokemonMasters,
    authorId: SeedUser.elisa,
    content: 'Compre cartas baratas no meu site externo!!!',
  },
  {
    id: messageId(6),
    groupId: SeedGroup.pokemonMasters,
    authorId: SeedUser.bruno,
    contentType: 'CARD',
    cardId: SeedCard.charizard,
    content: 'Meu Charizard de 1999 chegou!',
  },
];

export const SeedReport = {
  dismissed: reportId(4),
} as const;

const reports: Prisma.ReportCreateManyInput[] = [
  {
    id: reportId(1),
    reporterId: SeedUser.carla,
    groupMessageId: offensiveMessage,
    targetType: 'GROUP_MESSAGE',
    reason: 'Ofensa',
    description: 'Mensagem ofensiva contra os membros do grupo.',
  },
  {
    id: reportId(2),
    reporterId: SeedUser.bruno,
    groupMessageId: spamMessage,
    targetType: 'GROUP_MESSAGE',
    reason: 'Spam',
    description: 'Divulgação de site externo.',
  },
  {
    id: reportId(3),
    reporterId: SeedUser.ana,
    targetUserId: SeedUser.diego,
    targetType: 'USER',
    reason: 'Comportamento abusivo',
  },
  {
    id: SeedReport.dismissed,
    reporterId: SeedUser.ana,
    moderatorId: SeedUser.admin,
    groupMessageId: messageId(6),
    targetType: 'GROUP_MESSAGE',
    reason: 'Spam',
    status: 'DISMISSED',
    resolvedAt: new Date('2026-10-01T12:00:00Z'),
  },
];

export async function seedCommunity(prisma: PrismaClient): Promise<void> {
  for (const group of groups) {
    await prisma.group.upsert({ where: { id: group.id }, create: group, update: group });
  }
  for (const member of members) {
    await prisma.groupMember.upsert({ where: { id: member.id }, create: member, update: member });
  }
  for (const message of messages) {
    await prisma.groupMessage.upsert({
      where: { id: message.id },
      create: message,
      update: message,
    });
  }
  for (const report of reports) {
    await prisma.report.upsert({ where: { id: report.id }, create: report, update: report });
  }
}
