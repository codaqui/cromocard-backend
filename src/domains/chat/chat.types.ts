export interface Contact {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

export interface LastMessage {
  content: string;
  fromMe: boolean;
  createdAt: Date;
}

export type ContactBlock = 'BY_ME' | 'BY_CONTACT' | null;

export interface ConversationSummary {
  id: string;
  contact: Contact;
  block: ContactBlock;
  lastMessage: LastMessage | null;
  unreadCount: number;
  createdAt: Date;
}

export type QuotedMessage =
  | { id: string; authorUsername: string | null; content: string; unavailable: false }
  | { id: string; authorUsername: string | null; unavailable: true };

export interface ChatMessage {
  id: string;
  conversationId: string;
  author: { id: string; name: string; username: string | null };
  content: string;
  isRead: boolean;
  createdAt: Date;
  replyTo: QuotedMessage | null;
}

export interface NewMessage {
  conversationId: string;
  authorId: string;
  content: string;
  replyToId?: string;
}

export interface ReplyTarget {
  conversationId: string;
  deletedAt: Date | null;
}

export interface ConversationTotals {
  all: number;
  unread: number;
}

export interface ContactResult extends Contact {
  role: string;
  commonGroups: string[];
}
