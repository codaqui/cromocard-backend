import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { ConversationFilter, MessagesQuery } from './chat.validator';
import type { ChatMessage, ConversationSummary, ConversationTotals } from './chat.types';

export interface ConversationListOptions {
  q?: string;
  filter: ConversationFilter;
  skip: number;
  take: number;
}

interface SummaryRow {
  id: string;
  created_at: Date;
  contact_id: string;
  contact_name: string;
  contact_username: string | null;
  verified: boolean;
  last_content: string | null;
  last_author_id: string | null;
  last_at: Date | null;
  unread: number;
  total: number;
}

const authorSelect = { id: true, name: true, username: true } as const;
const messageSelect = {
  id: true,
  conversationId: true,
  content: true,
  isRead: true,
  createdAt: true,
  author: { select: authorSelect },
} as const;

function myConversations(userId: string, conversationId?: string) {
  const onlyOne = conversationId ? Prisma.sql`AND c.id = ${conversationId}::uuid` : Prisma.empty;
  return Prisma.sql`
    WITH mine AS (
      SELECT c.id, c.created_at, u.id AS contact_id, u.name AS contact_name, u.username AS contact_username,
        EXISTS (SELECT 1 FROM seller_verifications sv WHERE sv.user_id = u.id AND sv.status = 'APPROVED'
          AND sv.deleted_at IS NULL) AS verified
      FROM conversations c
      JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = ${userId}::uuid
        AND me.deleted_at IS NULL
      JOIN conversation_participants other ON other.conversation_id = c.id AND other.user_id <> ${userId}::uuid
        AND other.deleted_at IS NULL
      JOIN users u ON u.id = other.user_id AND u.deleted_at IS NULL
      WHERE c.deleted_at IS NULL ${onlyOne}
    ),
    stats AS (
      SELECT mine.*, last.content AS last_content, last.author_id AS last_author_id, last.created_at AS last_at,
        (SELECT count(*) FROM messages x WHERE x.conversation_id = mine.id AND x.deleted_at IS NULL
          AND NOT x.is_read AND x.author_id <> ${userId}::uuid)::int AS unread
      FROM mine
      LEFT JOIN LATERAL (SELECT content, author_id, created_at FROM messages m WHERE m.conversation_id = mine.id
        AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last ON true
    )`;
}

function listFilters({ q, filter }: Pick<ConversationListOptions, 'q' | 'filter'>) {
  const search = q
    ? Prisma.sql`AND (contact_name ILIKE ${`%${q}%`} OR contact_username ILIKE ${`%${q}%`})`
    : Prisma.empty;
  const unread = filter === 'unread' ? Prisma.sql`AND unread > 0` : Prisma.empty;
  return Prisma.sql`WHERE true ${search} ${unread}`;
}

function toSummary(row: SummaryRow, userId: string): ConversationSummary {
  return {
    id: row.id,
    contact: {
      id: row.contact_id,
      name: row.contact_name,
      username: row.contact_username,
      avatarUrl: null,
      verified: row.verified,
    },
    lastMessage: row.last_at
      ? {
          content: row.last_content ?? '',
          fromMe: row.last_author_id === userId,
          createdAt: row.last_at,
        }
      : null,
    unreadCount: row.unread,
    createdAt: row.created_at,
  };
}

export class ChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listConversations(userId: string, options: ConversationListOptions) {
    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      ${myConversations(userId)}
      SELECT *, count(*) OVER ()::int AS total FROM stats ${listFilters(options)}
      ORDER BY coalesce(last_at, created_at) DESC, id DESC
      LIMIT ${options.take} OFFSET ${options.skip}`;
    return { items: rows.map((row) => toSummary(row, userId)), total: rows[0]?.total ?? 0 };
  }

  async countConversations(userId: string): Promise<ConversationTotals> {
    const [row] = await this.prisma.$queryRaw<ConversationTotals[]>`
      ${myConversations(userId)}
      SELECT count(*)::int AS "all", (count(*) FILTER (WHERE unread > 0))::int AS unread FROM stats`;
    return row ?? { all: 0, unread: 0 };
  }

  async findConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationSummary | null> {
    const [row] = await this.prisma.$queryRaw<SummaryRow[]>`
      ${myConversations(userId, conversationId)}
      SELECT *, 1 AS total FROM stats`;
    return row ? toSummary(row, userId) : null;
  }

  async listMessages(conversationId: string, { cursor, limit }: MessagesQuery) {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...notDeleted, ...(cursor && { id: { lt: cursor } }) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: messageSelect,
    });
    const page = rows.slice(0, limit).reverse() as ChatMessage[];
    return { items: page, nextCursor: rows.length > limit ? (page[0]?.id ?? null) : null };
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    await this.prisma.message.updateMany({
      where: { conversationId, authorId: { not: userId }, isRead: false, ...notDeleted },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async createMessage(
    conversationId: string,
    authorId: string,
    content: string,
  ): Promise<ChatMessage> {
    const message = await this.prisma.message.create({
      data: { conversationId, authorId, content },
      select: messageSelect,
    });
    return message as ChatMessage;
  }

  async findDirectConversationId(userId: string, contactId: string): Promise<string | null> {
    const both = [userId, contactId].map((id) => ({
      participants: { some: { userId: id, ...notDeleted } },
    }));
    const conversation = await this.prisma.conversation.findFirst({
      where: { listingId: null, ...notDeleted, AND: both },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }

  async createDirectConversation(userId: string, contactId: string): Promise<string> {
    const conversation = await this.prisma.conversation.create({
      data: { participants: { create: [{ userId }, { userId: contactId }] } },
      select: { id: true },
    });
    return conversation.id;
  }

  async listPartnerIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: {
        userId: { not: userId },
        ...notDeleted,
        conversation: { ...notDeleted, participants: { some: { userId, ...notDeleted } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((row) => row.userId);
  }
}
