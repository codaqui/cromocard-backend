import { buildPaginationMeta, toSkipTake } from '@/shared/utils/pagination';

import { ConversationNotFoundError } from './chat.errors';
import type { ChatRepository } from './chat.repository';
import type { ChatMessage, ConversationSummary } from './chat.types';
import type { ListConversationsQuery, MessagesQuery, SendMessageInput } from './chat.validator';

export type ChatStore = Pick<
  ChatRepository,
  | 'listConversations'
  | 'countConversations'
  | 'findConversation'
  | 'listMessages'
  | 'markAsRead'
  | 'createMessage'
>;

export interface SentMessage {
  message: ChatMessage;
  recipientId: string;
}

export class ChatService {
  constructor(private readonly repository: ChatStore) {}

  async listConversations(userId: string, query: ListConversationsQuery) {
    const options = { q: query.q, filter: query.filter, ...toSkipTake(query) };
    const [{ items, total }, totals] = await Promise.all([
      this.repository.listConversations(userId, options),
      this.repository.countConversations(userId),
    ]);
    return { items, meta: { ...buildPaginationMeta(query, total), totals } };
  }

  async listMessages(userId: string, conversationId: string, query: MessagesQuery) {
    await this.conversationOf(userId, conversationId);
    const { items, nextCursor } = await this.repository.listMessages(conversationId, query);
    return { items, meta: { nextCursor } };
  }

  async markAsRead(userId: string, conversationId: string): Promise<void> {
    await this.conversationOf(userId, conversationId);
    await this.repository.markAsRead(conversationId, userId);
  }

  async sendMessage(
    userId: string,
    { conversationId, content }: SendMessageInput,
  ): Promise<SentMessage> {
    const { contact } = await this.conversationOf(userId, conversationId);
    const message = await this.repository.createMessage(conversationId, userId, content);
    return { message, recipientId: contact.id };
  }

  async conversationOf(userId: string, conversationId: string): Promise<ConversationSummary> {
    const conversation = await this.repository.findConversation(userId, conversationId);
    if (!conversation) throw new ConversationNotFoundError();
    return conversation;
  }
}
