import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContactNotFoundError,
  ConversationBlockedError,
  ConversationNotFoundError,
} from './chat.errors';
import { ChatService, type ChatStore, type ContactsStore } from './chat.service';
import type { ChatMessage, ConversationSummary } from './chat.types';

const ANA = 'ana';
const CONVERSATION = '0199a000-0000-7000-8000-000000000001';

const summary = (changes: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: CONVERSATION,
  contact: { id: 'elisa', name: 'Elisa', username: 'elisa.raras', avatarUrl: null, verified: true },
  lastMessage: { content: 'Combinado, compro pelo anúncio.', fromMe: true, createdAt: new Date() },
  unreadCount: 0,
  createdAt: new Date(),
  ...changes,
});

const message: ChatMessage = {
  id: 'm1',
  conversationId: CONVERSATION,
  author: { id: ANA, name: 'Ana', username: 'ana' },
  content: 'Oi',
  isRead: false,
  createdAt: new Date(),
};

let store: { [K in keyof ChatStore]: ReturnType<typeof vi.fn> };
let contacts: { [K in keyof ContactsStore]: ReturnType<typeof vi.fn> };
let service: ChatService;

beforeEach(() => {
  store = {
    listConversations: vi.fn().mockResolvedValue({ items: [summary()], total: 1 }),
    countConversations: vi.fn().mockResolvedValue({ all: 4, unread: 2 }),
    findConversation: vi.fn().mockResolvedValue(summary()),
    listMessages: vi.fn().mockResolvedValue({ items: [message], nextCursor: null }),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    createMessage: vi.fn().mockResolvedValue(message),
    findOrCreateDirectConversation: vi.fn().mockResolvedValue({ id: CONVERSATION, created: true }),
    listPartnerIds: vi.fn().mockResolvedValue(['elisa']),
  };
  contacts = {
    search: vi.fn().mockResolvedValue([]),
    isReachable: vi.fn().mockResolvedValue(true),
    isBlockedBetween: vi.fn().mockResolvedValue(false),
  };
  service = new ChatService(store as unknown as ChatStore, contacts as unknown as ContactsStore);
});

describe('listConversations', () => {
  it('CA12: repassa busca, aba e página, e junta os totais para o selo e as abas', async () => {
    const result = await service.listConversations(ANA, {
      page: 2,
      pageSize: 10,
      q: 'ren',
      filter: 'unread',
    });

    expect(store.listConversations).toHaveBeenCalledWith(ANA, {
      q: 'ren',
      filter: 'unread',
      skip: 10,
      take: 10,
    });
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      totals: { all: 4, unread: 2 },
    });
  });
});

describe('participação (R1)', () => {
  it.each([
    ['ler as mensagens', () => service.listMessages(ANA, CONVERSATION, { limit: 30 })],
    ['marcar como lidas', () => service.markAsRead(ANA, CONVERSATION)],
    ['enviar', () => service.sendMessage(ANA, { conversationId: CONVERSATION, content: 'Oi' })],
  ])('CA7: responde 404 ao %s numa conversa de outras pessoas', async (_case, call) => {
    store.findConversation.mockResolvedValue(null);

    await expect(call()).rejects.toBeInstanceOf(ConversationNotFoundError);
    expect(store.listMessages).not.toHaveBeenCalled();
    expect(store.markAsRead).not.toHaveBeenCalled();
    expect(store.createMessage).not.toHaveBeenCalled();
  });
});

describe('mensagens', () => {
  it('CA1: devolve as mensagens com o cursor das anteriores', async () => {
    store.listMessages.mockResolvedValue({ items: [message], nextCursor: 'm0' });

    await expect(service.listMessages(ANA, CONVERSATION, { limit: 30 })).resolves.toEqual({
      items: [message],
      meta: { nextCursor: 'm0' },
    });
  });

  it('CA3: marca como lidas as recebidas da conversa', async () => {
    await service.markAsRead(ANA, CONVERSATION);

    expect(store.markAsRead).toHaveBeenCalledWith(CONVERSATION, ANA);
  });

  it('CA16: grava a mensagem e diz quem recebe', async () => {
    await expect(
      service.sendMessage(ANA, { conversationId: CONVERSATION, content: 'Oi' }),
    ).resolves.toEqual({
      message,
      recipientId: 'elisa',
    });
    expect(store.createMessage).toHaveBeenCalledWith(CONVERSATION, ANA, 'Oi');
    expect(contacts.isBlockedBetween).toHaveBeenCalledWith(ANA, 'elisa');
  });

  it('L18: recusa o envio quando há bloqueio entre os dois, sem gravar a mensagem', async () => {
    contacts.isBlockedBetween.mockResolvedValue(true);

    await expect(
      service.sendMessage(ANA, { conversationId: CONVERSATION, content: 'Oi' }),
    ).rejects.toBeInstanceOf(ConversationBlockedError);
    expect(store.createMessage).not.toHaveBeenCalled();
  });
});

describe('Nova conversa (R13)', () => {
  it('CA13: cria a conversa com quem ainda não tinha', async () => {
    const result = await service.startConversation(ANA, 'renan');

    expect(store.findOrCreateDirectConversation).toHaveBeenCalledWith(ANA, 'renan');
    expect(result).toMatchObject({ conversation: { id: CONVERSATION }, created: true });
  });

  it('CA13: reaproveita a conversa que já existe, sem criar outra', async () => {
    store.findOrCreateDirectConversation.mockResolvedValue({ id: CONVERSATION, created: false });

    const result = await service.startConversation(ANA, 'elisa');

    expect(result).toMatchObject({ conversation: { id: CONVERSATION }, created: false });
  });

  it('CA14: recusa com 404 quem está bloqueado, suspenso ou não existe', async () => {
    contacts.isReachable.mockResolvedValue(false);

    await expect(service.startConversation(ANA, 'gabriela')).rejects.toBeInstanceOf(
      ContactNotFoundError,
    );
    expect(store.findOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it('repassa a busca de contatos com a aba', async () => {
    await service.listContacts(ANA, { q: 'ren', scope: 'groups' });

    expect(contacts.search).toHaveBeenCalledWith(ANA, { q: 'ren', scope: 'groups' });
  });
});

describe('presença (R15)', () => {
  it('lista com quem o usuário conversa, para avisar o online', async () => {
    await expect(service.listPartnerIds(ANA)).resolves.toEqual(['elisa']);
  });
});
