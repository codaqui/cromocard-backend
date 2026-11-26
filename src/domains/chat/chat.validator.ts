import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const MESSAGES_PAGE_SIZE = 30;
export const MESSAGE_MAX_LENGTH = 2000;
export const SEARCH_MAX_LENGTH = 60;

const searchTerm = z.string().trim().max(SEARCH_MAX_LENGTH).optional();
const uuid = z.uuid({ error: 'Identificador inválido.' });

export const conversationFilters = ['all', 'unread'] as const;
export const contactScopes = ['all', 'groups', 'sellers', 'deals'] as const;

export const listConversationsQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: searchTerm,
  filter: z.enum(conversationFilters).default('all'),
});

export const conversationIdParamSchema = z.object({ id: uuid });

export const startConversationSchema = z.object({ userId: uuid });

export const messagesQuerySchema = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MESSAGES_PAGE_SIZE),
});

export const contactsQuerySchema = z.object({
  q: searchTerm,
  scope: z.enum(contactScopes).default('all'),
});

export const sendMessageSchema = z.object({
  conversationId: uuid,
  content: z
    .string()
    .trim()
    .min(1, { error: 'Escreva a mensagem.' })
    .max(MESSAGE_MAX_LENGTH, {
      error: `A mensagem pode ter até ${MESSAGE_MAX_LENGTH} caracteres.`,
    }),
  replyToId: uuid.optional(),
});

export const conversationRoomSchema = z.object({ conversationId: uuid });

export const presenceListSchema = z.object({ userIds: z.array(uuid).max(100) });

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ConversationFilter = (typeof conversationFilters)[number];
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
export type ContactsQuery = z.infer<typeof contactsQuerySchema>;
export type ContactScope = (typeof contactScopes)[number];
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
