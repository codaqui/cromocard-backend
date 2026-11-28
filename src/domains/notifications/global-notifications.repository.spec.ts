import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import { PrismaGlobalNotificationsRepository } from './global-notifications.repository';

function prismaWhereDispatchLeftTheQueue() {
  const tx = {
    globalNotification: {
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
      findUniqueOrThrow: vi.fn(),
    },
    notification: { createMany: vi.fn() },
  };
  const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  return { tx, prisma: prisma as unknown as PrismaClient };
}

describe('PrismaGlobalNotificationsRepository', () => {
  it('CCD100: não entrega o agendado que saiu da fila (cancelado ou já entregue)', async () => {
    const { tx, prisma } = prismaWhereDispatchLeftTheQueue();
    const repository = new PrismaGlobalNotificationsRepository(prisma);

    const delivered = await repository.deliverScheduled('dispatch-1', {
      recipientIds: ['user-1'],
      inAppRecipientIds: ['user-1'],
      inApp: true,
      sentAt: new Date(),
    });

    expect(delivered).toBeNull();
    const [[update]] = tx.globalNotification.updateMany.mock.calls as unknown as [
      [{ where: { status: string } }],
    ];
    expect(update.where.status).toBe('SCHEDULED');
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
