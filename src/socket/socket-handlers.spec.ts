import { describe, expect, it } from 'vitest';

import { socketHandlers } from './socket-handlers';

describe('socketHandlers', () => {
  it('registra só funções (io, socket) que o createSocketServer chama em cada conexão', () => {
    expect(socketHandlers.every((register) => typeof register === 'function')).toBe(true);
  });
});
