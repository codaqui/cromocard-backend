import type { NewNotification } from './notifications.repository';

export const NEW_MESSAGE_EXCERPT_LENGTH = 140;

export interface NewMessageEvent {
  recipientId: string;
  conversationId: string;
  author: { name: string; username: string | null };
  content: string;
}

const excerptOf = (content: string) =>
  content.length > NEW_MESSAGE_EXCERPT_LENGTH
    ? `${content.slice(0, NEW_MESSAGE_EXCERPT_LENGTH - 1).trimEnd()}…`
    : content;

export function newMessageNotification({
  recipientId,
  conversationId,
  author,
  content,
}: NewMessageEvent): NewNotification & { referenceLink: string } {
  return {
    userId: recipientId,
    type: 'NEW_MESSAGE',
    title: `@${author.username ?? author.name}`,
    message: excerptOf(content),
    referenceLink: `/mensagens?conversa=${conversationId}`,
  };
}
