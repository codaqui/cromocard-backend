import { describe, expect, it, vi } from 'vitest';

import { categoryOf } from '@/domains/notifications/notification-types';
import type { PrismaClient } from '@/generated/prisma/client';

import { notificationsSeed, seedNotifications } from './notifications.seed';
import { userIdOf } from './users.seed';

describe('seed de notificações', () => {
  const ofAna = notificationsSeed.filter(({ userId }) => userId === userIdOf('ana'));

  it('a Ana tem lidas e não lidas, com e sem link, uma mensagem nova e um disparo global', () => {
    expect(ofAna.some(({ isRead }) => isRead)).toBe(true);
    expect(ofAna.some(({ isRead }) => !isRead)).toBe(true);
    expect(ofAna.some(({ referenceLink }) => referenceLink === null)).toBe(true);
    expect(ofAna.some(({ referenceLink }) => referenceLink !== null)).toBe(true);
    expect(ofAna.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['NEW_MESSAGE', 'GLOBAL']),
    );
  });

  it('o disparo global aponta para o disparo do seed', () => {
    const global = notificationsSeed.filter(({ type }) => type === 'GLOBAL');

    expect(global.every(({ globalNotificationId }) => globalNotificationId !== null)).toBe(true);
  });

  it('cada notificação cai numa categoria da central', () => {
    expect(new Set(notificationsSeed.map(({ type }) => categoryOf(type)))).toEqual(
      new Set(['MESSAGES', 'PLATFORM']),
    );
  });

  it('grava cada notificação por upsert do id fixo, e rodar de novo não duplica', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const prisma = { notification: { upsert } } as unknown as PrismaClient;

    await seedNotifications(prisma);

    expect(upsert).toHaveBeenCalledTimes(notificationsSeed.length);
    const [first] = notificationsSeed;
    expect(upsert).toHaveBeenCalledWith({ where: { id: first?.id }, create: first, update: first });
  });
});
