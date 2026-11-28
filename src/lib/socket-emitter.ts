import { createAdapter } from '@socket.io/postgres-adapter';
import pg from 'pg';

import { env } from '@/config/env';

export interface RoomEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface SocketEmitter {
  to(room: string | string[]): RoomEmitter;
}

export interface NotifyClient {
  query(text: string, values: unknown[]): Promise<unknown>;
}

const NAMESPACE = '/';
const CHANNEL = `socket.io#${NAMESPACE}`;
const EMITTER_UID = 'emitter';
const BROADCAST = 3;
const EVENT_PACKET = 2;
const MAX_PAYLOAD_BYTES = 8000;
const EMITTER_POOL_SIZE = 2;

export class PostgresSocketEmitter implements SocketEmitter {
  constructor(private readonly client: NotifyClient) {}

  to(room: string | string[]): RoomEmitter {
    const rooms = Array.isArray(room) ? room : [room];
    return { emit: (event, ...args) => this.broadcast(rooms, [event, ...args]) };
  }

  private broadcast(rooms: string[], data: unknown[]): Promise<unknown> {
    const payload = JSON.stringify({
      uid: EMITTER_UID,
      nsp: NAMESPACE,
      type: BROADCAST,
      data: { packet: { type: EVENT_PACKET, data, nsp: NAMESPACE }, opts: { rooms, except: [] } },
    });
    if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
      return Promise.reject(new Error('Evento grande demais para o pg_notify'));
    }
    return this.client.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]);
  }
}

let emitter: PostgresSocketEmitter | null = null;

export function socketEmitter(): SocketEmitter {
  emitter ??= new PostgresSocketEmitter(
    new pg.Pool({ connectionString: env.DATABASE_URL, max: EMITTER_POOL_SIZE }),
  );
  return emitter;
}

export function createPostgresAdapter(): ReturnType<typeof createAdapter> {
  return createAdapter(new pg.Pool({ connectionString: env.DATABASE_URL }));
}
