import { describe, expect, it } from 'vitest';

import { PostgresSocketEmitter } from './socket-emitter';

function recordingClient() {
  const queries: { text: string; values: unknown[] }[] = [];
  return {
    queries,
    client: {
      query: (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return Promise.resolve();
      },
    },
  };
}

describe('PostgresSocketEmitter', () => {
  it('publica no canal do adapter um broadcast com o namespace e as rooms', async () => {
    const { client, queries } = recordingClient();

    await new PostgresSocketEmitter(client).to('user:ana').emit('notification:new', { id: '1' });

    const [query] = queries;
    expect(query?.text).toBe('SELECT pg_notify($1, $2)');
    expect(query?.values[0]).toBe('socket.io#/');
    expect(JSON.parse(String(query?.values[1]))).toEqual({
      uid: 'emitter',
      nsp: '/',
      type: 3,
      data: {
        packet: { type: 2, data: ['notification:new', { id: '1' }], nsp: '/' },
        opts: { rooms: ['user:ana'], except: [] },
      },
    });
  });

  it('aceita várias rooms de uma vez', async () => {
    const { client, queries } = recordingClient();

    await new PostgresSocketEmitter(client).to(['user:ana', 'user:bruno']).emit('evento');

    const payload = JSON.parse(String(queries[0]?.values[1])) as {
      data: { opts: { rooms: string[] } };
    };
    expect(payload.data.opts.rooms).toEqual(['user:ana', 'user:bruno']);
  });

  it('recusa evento acima do limite do pg_notify, sem consultar o banco', async () => {
    const { client, queries } = recordingClient();

    await expect(
      new PostgresSocketEmitter(client).to('user:ana').emit('evento', 'x'.repeat(9000)),
    ).rejects.toThrow('Evento grande demais para o pg_notify');
    expect(queries).toHaveLength(0);
  });
});
