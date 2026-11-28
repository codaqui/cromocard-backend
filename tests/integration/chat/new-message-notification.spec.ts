import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chatService } from '@/domains/chat/chat.module';
import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const fx = new ChatFixtures(`nm${Date.now()}`);

let ana: TestUser;
let bruno: TestUser;
let conversationId: string;

const newMessagesOfAna = () =>
  prisma.notification.findMany({
    where: { userId: ana.id, type: 'NEW_MESSAGE' },
    orderBy: { createdAt: 'asc' },
  });

beforeAll(async () => {
  ana = await fx.createUser('ana');
  bruno = await fx.createUser('bruno');
  conversationId = await fx.createConversation(ana, bruno);
});

afterAll(async () => {
  await fx.cleanup();
});

describe('notificação de mensagem nova no chat pessoal (R13)', () => {
  it('CA16: duas mensagens seguidas geram uma só notificação; depois de lida, a próxima gera outra', async () => {
    await chatService.sendMessage(bruno.id, { conversationId, content: 'Primeira mensagem' });
    await chatService.sendMessage(bruno.id, { conversationId, content: 'Segunda mensagem' });

    const [first, ...others] = await newMessagesOfAna();
    expect(others).toHaveLength(0);
    expect(first).toMatchObject({
      message: 'Primeira mensagem',
      referenceLink: `/mensagens?conversa=${conversationId}`,
      isRead: false,
    });
    expect(first?.title).toMatch(/^@nm\d+_bruno$/);

    await notificationsService.markAsRead(ana.id, first?.id ?? '');
    await chatService.sendMessage(bruno.id, { conversationId, content: 'Terceira mensagem' });

    expect((await newMessagesOfAna()).map(({ message }) => message)).toEqual([
      'Primeira mensagem',
      'Terceira mensagem',
    ]);
  });

  it('CA23: com mensagens diretas desligadas no site, nenhuma notificação é gravada', async () => {
    await prisma.notification.deleteMany({ where: { userId: ana.id } });
    await prisma.notificationPreference.create({
      data: { userId: ana.id, event: 'DIRECT_MESSAGES', inApp: false, email: true },
    });

    await chatService.sendMessage(bruno.id, { conversationId, content: 'Oi de novo' });

    expect(await newMessagesOfAna()).toHaveLength(0);
  });

  it('quem enviou não recebe notificação', async () => {
    const ofBruno = await prisma.notification.count({ where: { userId: bruno.id } });

    expect(ofBruno).toBe(0);
  });
});
