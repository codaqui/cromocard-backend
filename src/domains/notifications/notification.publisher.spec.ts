import { describe, expect, it, vi } from 'vitest';

import type { SocketEmitter } from '@/lib/socket-emitter';

import { NotificationPublisher } from './notification.publisher';
import type { NotificationRecord } from './notifications.repository';

const record = (userId: string): NotificationRecord => ({
  id: `notificacao-${userId}`,
  userId,
  title: 'Seu pedido foi enviado',
  message: 'Código AA123',
  type: 'GLOBAL',
  referenceLink: '/pedidos/1',
  isRead: false,
  createdAt: new Date('2026-11-28T12:00:00Z'),
});

function recordingEmitter() {
  const emitted: { room: string | string[]; event: string; payload: unknown }[] = [];
  const emitter: SocketEmitter = {
    to: (room) => ({
      emit: (event, payload) => emitted.push({ room, event, payload }),
    }),
  };
  return { emitter, emitted };
}

describe('NotificationPublisher', () => {
  it('CA6: emite notification:new na room de cada destinatário, sem o userId no payload', () => {
    const { emitter, emitted } = recordingEmitter();
    const publisher = new NotificationPublisher(() => emitter, { error: vi.fn() });

    publisher.publish([record('ana'), record('bruno')]);

    expect(emitted.map(({ room, event }) => ({ room, event }))).toEqual([
      { room: 'user:ana', event: 'notification:new' },
      { room: 'user:bruno', event: 'notification:new' },
    ]);
    expect(emitted[0]?.payload).toMatchObject({ id: 'notificacao-ana', category: 'PLATFORM' });
    expect(emitted[0]?.payload).not.toHaveProperty('userId');
  });

  it('falha ao emitir vai para o log e não interrompe os outros destinatários', () => {
    const { emitter, emitted } = recordingEmitter();
    const logger = { error: vi.fn() };
    let calls = 0;
    const flaky: SocketEmitter = {
      to: (room) => {
        calls += 1;
        if (calls === 1) throw new Error('PostgreSQL fora do ar');
        return emitter.to(room);
      },
    };
    const publisher = new NotificationPublisher(() => flaky, logger);

    publisher.publish([record('ana'), record('bruno')]);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'notificacao-ana' }),
      'Falha ao publicar a notificação em tempo real',
    );
    expect(emitted.map(({ room }) => room)).toEqual(['user:bruno']);
  });

  it('rejeição assíncrona do emitter também vai para o log', async () => {
    const logger = { error: vi.fn() };
    const rejecting: SocketEmitter = {
      to: () => ({ emit: () => Promise.reject(new Error('pg_notify falhou')) }),
    };

    new NotificationPublisher(() => rejecting, logger).publish([record('ana')]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'notificacao-ana' }),
      'Falha ao publicar a notificação em tempo real',
    );
  });
});
