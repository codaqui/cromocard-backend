import { describe, expect, it } from 'vitest';

import {
  contactsQuerySchema,
  conversationIdParamSchema,
  listConversationsQuerySchema,
  messagesQuerySchema,
  presenceListSchema,
  sendMessageSchema,
  startConversationSchema,
} from './chat.validator';

const ID = '0199a000-0000-7000-8000-000000000001';

describe('chat.validator', () => {
  it('lista com a aba Todas, 50 por página e a busca sem espaços nas pontas (L4, L14)', () => {
    expect(listConversationsQuerySchema.parse({ q: '  ren ' })).toEqual({
      page: 1,
      pageSize: 50,
      q: 'ren',
      filter: 'all',
    });
  });

  it.each([
    ['filtro fora da lista', { filter: 'arquivadas' }],
    ['busca com mais de 60 caracteres', { q: 'a'.repeat(61) }],
  ])('recusa a lista com %s', (_case, query) => {
    expect(listConversationsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('carrega 30 mensagens por vez e aceita o cursor (L14)', () => {
    expect(messagesQuerySchema.parse({})).toEqual({ limit: 30 });
    expect(messagesQuerySchema.parse({ cursor: ID, limit: '10' })).toEqual({
      cursor: ID,
      limit: 10,
    });
  });

  it.each([
    ['cursor que não é UUID', { cursor: 'abc' }],
    ['limit acima de 50', { limit: 51 }],
    ['limit zero', { limit: 0 }],
  ])('recusa as mensagens com %s', (_case, query) => {
    expect(messagesQuerySchema.safeParse(query).success).toBe(false);
  });

  it('recusa ids que não são UUID na conversa e no Conversar', () => {
    expect(conversationIdParamSchema.safeParse({ id: '1' }).success).toBe(false);
    expect(startConversationSchema.safeParse({ userId: 'x' }).success).toBe(false);
  });

  it('busca contatos em Todos por padrão e recusa aba desconhecida (L5)', () => {
    expect(contactsQuerySchema.parse({})).toEqual({ scope: 'all' });
    expect(contactsQuerySchema.safeParse({ scope: 'desconhecidos' }).success).toBe(false);
  });

  it('CA16: envia o texto sem espaços nas pontas', () => {
    expect(sendMessageSchema.parse({ conversationId: ID, content: '  Combinado!  ' })).toEqual({
      conversationId: ID,
      content: 'Combinado!',
    });
  });

  it.each([
    ['vazia', '   ', 'Escreva a mensagem.'],
    ['com mais de 2000 caracteres', 'a'.repeat(2001), 'A mensagem pode ter até 2000 caracteres.'],
  ])('recusa mensagem %s', (_case, content, message) => {
    const result = sendMessageSchema.safeParse({ conversationId: ID, content });

    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it('CA1: aceita a resposta com a mensagem citada (R5)', () => {
    expect(
      sendMessageSchema.parse({ conversationId: ID, content: 'Quero sim', replyToId: ID }),
    ).toEqual({ conversationId: ID, content: 'Quero sim', replyToId: ID });
  });

  it('CA3: recusa a resposta vazia mesmo com a mensagem citada (R9)', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: ID,
      content: '  ',
      replyToId: ID,
    });

    expect(result.error?.issues[0]?.message).toBe('Escreva a mensagem.');
  });

  it('CA5: recusa a citação que não é um identificador', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: ID,
      content: 'Oi',
      replyToId: 'mensagem-1',
    });

    expect(result.error?.issues[0]?.path).toEqual(['replyToId']);
  });

  it('pergunta a presença de até 100 pessoas', () => {
    expect(presenceListSchema.safeParse({ userIds: Array(101).fill(ID) }).success).toBe(false);
  });
});
