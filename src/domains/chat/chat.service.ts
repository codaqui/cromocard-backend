import { buildPaginationMeta, toSkipTake } from '@/shared/utils/pagination';

import { ContactNotFoundError, ConversationNotFoundError } from './chat.errors';
import type { ChatRepository } from './chat.repository';
import type { ChatMessage, ConversationSummary } from './chat.types';
import type {
  ContactsQuery,
  ListConversationsQuery,
  MessagesQuery,
  SendMessageInput,
} from './chat.validator';
import type { ContactsRepository } from './contacts.repository';

export type ChatStore = Pick<
  ChatRepository,
  | 'listConversations'
  | 'countConversations'
  | 'findConversation'
  | 'listMessages'
  | 'markAsRead'
  | 'createMessage'
  | 'findDirectConversationId'
  | 'createDirectConversation'
>;

export type ContactsStore = Pick<ContactsRepository, 'search' | 'isReachable'>;

export interface StartedConversation {
  conversation: ConversationSummary;
  created: boolean;
}

export interface SentMessage {
  message: ChatMessage;
  recipientId: string;
}

export class ChatService {
  constructor(
    private readonly repository: ChatStore,
    private readonly contacts: ContactsStore,
  ) {}

  listContacts(userId: string, query: ContactsQuery) {
    return this.contacts.search(userId, query);
  }

  async startConversation(userId: string, contactId: string): Promise<StartedConversation> {
    if (!(await this.contacts.isReachable(userId, contactId))) throw new ContactNotFoundError();
    const existing = await this.repository.findDirectConversationId(userId, contactId);
    const id = existing ?? (await this.repository.createDirectConversation(userId, contactId));
    return { conversation: await this.conversationOf(userId, id), created: existing === null };
  }

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
