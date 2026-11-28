import { describe, expect, it } from 'vitest';

import { NEW_MESSAGE_EXCERPT_LENGTH, newMessageNotification } from './new-message.notification';

const event = {
  recipientId: 'ana',
  conversationId: 'c-1',
  author: { name: 'Bruno', username: 'bruno.cards' },
  content: 'Oi! A carta chegou certinho.',
};

describe('newMessageNotification', () => {
  it('R13: "@remetente", o trecho da mensagem e o link da conversa', () => {
    expect(newMessageNotification(event)).toEqual({
      userId: 'ana',
      type: 'NEW_MESSAGE',
      title: '@bruno.cards',
      message: 'Oi! A carta chegou certinho.',
      referenceLink: '/mensagens?conversa=c-1',
    });
  });

  it('sem nome de usuário, usa o nome', () => {
    expect(
      newMessageNotification({ ...event, author: { name: 'Bruno', username: null } }).title,
    ).toBe('@Bruno');
  });

  it('corta a mensagem longa com reticências', () => {
    const { message } = newMessageNotification({ ...event, content: 'a'.repeat(300) });

    expect(message).toHaveLength(NEW_MESSAGE_EXCERPT_LENGTH);
    expect(message.endsWith('…')).toBe(true);
  });
});
