import { afterAll, describe, expect, it } from 'vitest';

import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';

const createdUserIds: string[] = [];

async function createUser() {
  const user = await prisma.user.create({
    data: {
      name: 'Usuário Notificado',
      email: `notificado-${crypto.randomUUID()}@cromocard.dev`,
      role: 'CUSTOMER',
    },
  });
  createdUserIds.push(user.id);
  return user;
}

const notificationFor = (userId: string) => ({
  userId,
  title: 'Aviso',
  message: 'Mensagem de teste',
  type: 'GLOBAL' as const,
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('NotificationsService', () => {
  it('grava a notificação fora de uma transação', async () => {
    const user = await createUser();

    await notificationsService.notify(notificationFor(user.id));

    await expect(prisma.notification.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it('desfaz a notificação quando a transação em que foi gravada falha', async () => {
    const user = await createUser();

    await expect(
      runInTransaction(async (tx) => {
        await notificationsService.notify(notificationFor(user.id), tx);
        throw new Error('falha depois de notificar');
      }),
    ).rejects.toThrow('falha depois de notificar');

    await expect(prisma.notification.count({ where: { userId: user.id } })).resolves.toBe(0);
  });
});
