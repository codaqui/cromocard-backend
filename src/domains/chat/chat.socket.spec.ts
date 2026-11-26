import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/config/logger';
import type { AppSocket, AppSocketServer } from '@/socket/socket.types';

import { createChatSocketHandlers, type ChatSocketService } from './chat.socket';
import { PresenceRegistry } from './presence.registry';

function fakeSocket() {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const socket = {
    data: { user: { id: 'ana', role: 'CUSTOMER' } },
    on: (event: string, listener: (...args: unknown[]) => unknown) =>
      listeners.set(event, listener),
  };
  return { socket: socket as unknown as AppSocket, listeners };
}

describe('presença no chat (R15)', () => {
  it('se o banco falhar ao avisar a presença, registra no log e não derruba o processo', async () => {
    const failure = new Error('banco fora do ar');
    const service = { listPartnerIds: vi.fn().mockRejectedValue(failure) };
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { socket, listeners } = fakeSocket();
    const handlers = createChatSocketHandlers({
      service: service as unknown as ChatSocketService,
      presence: new PresenceRegistry(),
    });

    handlers({} as AppSocketServer, socket);
    listeners.get('disconnect')?.();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledWith(
      { err: failure, userId: 'ana' },
      'Não foi possível avisar a presença',
    );
    warn.mockRestore();
  });
});
