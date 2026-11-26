import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import jwt from 'jsonwebtoken';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { env } from '@/config/env';
import { signAccessToken } from '@/lib/jwt';
import { NotFoundError } from '@/shared/errors/http-errors';

import { withAck } from './socket-ack';
import { userRoom } from './socket-rooms';
import { createSocketServer } from './socket-server';
import type { AckResponse, AppSocketServer, SocketHandlers } from './socket.types';

const ALICE = { id: '01a13d1f-6c97-7e27-a6d2-d05ec95d3260', role: 'CUSTOMER' } as const;
const BOB = { id: '01a13d1f-6c97-7e27-a6d2-d05ec95d3261', role: 'SELLER' } as const;

const echoSchema = z.object({ text: z.string().min(1) });

const testHandlers: SocketHandlers = (_io, socket) => {
  socket.on(
    'test:whoami',
    withAck(async () => Promise.resolve(socket.data.user)),
  );
  socket.on(
    'test:echo',
    withAck(async (payload: unknown) => Promise.resolve(echoSchema.parse(payload).text)),
  );
  socket.on(
    'test:missing',
    withAck(async () =>
      Promise.reject(new NotFoundError('Conversa não encontrada', 'CONVERSATION_NOT_FOUND')),
    ),
  );
  socket.on(
    'test:crash',
    withAck(async () => Promise.reject(new Error('banco fora do ar'))),
  );
  socket.on(
    'test:sync-crash',
    withAck((): Promise<never> => {
      throw new Error('falha antes da Promise');
    }),
  );
};

let httpServer: HttpServer;
let io: AppSocketServer;
let url: string;
const clients: ClientSocket[] = [];

function client(auth: Record<string, unknown>): ClientSocket {
  const socket = connect(url, {
    auth,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

function refused(socket: ClientSocket): Promise<Error & { data?: unknown }> {
  return new Promise((resolve) => socket.once('connect_error', resolve));
}

function emitWithAck<T>(socket: ClientSocket, event: string, payload?: unknown) {
  return socket.timeout(2000).emitWithAck(event, payload) as Promise<AckResponse<T>>;
}

beforeAll(async () => {
  httpServer = createServer();
  io = createSocketServer(httpServer, { handlers: [testHandlers] });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  clients.splice(0).forEach((socket) => socket.disconnect());
});

afterAll(async () => {
  await new Promise<void>((resolve) => void io.close(() => resolve()));
});

describe('createSocketServer', () => {
  it('aceita o access token válido e grava o usuário no socket', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    await expect(emitWithAck(socket, 'test:whoami')).resolves.toEqual({ data: ALICE });
  });

  it('põe cada socket na room user:<id>, e só ele recebe o que vai para ela', async () => {
    const alice = client({ token: signAccessToken(ALICE) });
    const bob = client({ token: signAccessToken(BOB) });
    await Promise.all([connected(alice), connected(bob)]);
    const bobReceived: unknown[] = [];
    bob.on('notification:new', (payload: unknown) => bobReceived.push(payload));

    const received = new Promise((resolve) => alice.once('notification:new', resolve));
    io.to(userRoom(ALICE.id)).emit('notification:new', { title: 'Olá' });

    await expect(received).resolves.toEqual({ title: 'Olá' });
    expect(bobReceived).toEqual([]);
  });

  it('desconecta o socket quando o access token vence', async () => {
    const token = jwt.sign({ role: ALICE.role }, env.JWT_SECRET, {
      subject: ALICE.id,
      expiresIn: 1,
      algorithm: 'HS256',
    });
    const socket = client({ token });
    await connected(socket);

    const reason = await new Promise((resolve) => socket.once('disconnect', resolve));

    expect(reason).toBe('io server disconnect');
  });

  it.each([
    ['sem token', {}],
    ['com token vazio', { token: '' }],
    ['com token que não é texto', { token: 123 }],
    ['com token inválido', { token: 'nao-e-um-jwt' }],
  ])('recusa a conexão %s com UNAUTHORIZED', async (_case, auth) => {
    const error = await refused(client(auth));

    expect(error.message).toBe('UNAUTHORIZED');
    expect(error.data).toEqual({ error: 'UNAUTHORIZED', message: 'Autenticação necessária' });
  });
});

describe('withAck', () => {
  it('responde { data } com o resultado do handler', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    await expect(emitWithAck(socket, 'test:echo', { text: 'oi' })).resolves.toEqual({ data: 'oi' });
  });

  it('responde VALIDATION_ERROR com os campos quando o Zod recusa o payload', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    const response = await emitWithAck(socket, 'test:echo', { text: '' });

    expect(response).toMatchObject({ error: 'VALIDATION_ERROR', message: 'Dados inválidos' });
    expect(response).toHaveProperty('details.0.field', 'text');
  });

  it('responde o código do AppError', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    await expect(emitWithAck(socket, 'test:missing')).resolves.toEqual({
      error: 'CONVERSATION_NOT_FOUND',
      message: 'Conversa não encontrada',
    });
  });

  it('responde INTERNAL_ERROR sem vazar a mensagem do erro inesperado', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    await expect(emitWithAck(socket, 'test:crash')).resolves.toEqual({
      error: 'INTERNAL_ERROR',
      message: 'Erro inesperado. Tente novamente mais tarde.',
    });
  });

  it('responde INTERNAL_ERROR quando o handler falha antes de devolver a Promise', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    await expect(emitWithAck(socket, 'test:sync-crash')).resolves.toEqual({
      error: 'INTERNAL_ERROR',
      message: 'Erro inesperado. Tente novamente mais tarde.',
    });
  });

  it('não quebra quando o cliente emite sem callback de ack', async () => {
    const socket = client({ token: signAccessToken(ALICE) });
    await connected(socket);

    socket.emit('test:crash');

    await expect(emitWithAck(socket, 'test:echo', { text: 'ainda conectado' })).resolves.toEqual({
      data: 'ainda conectado',
    });
  });
});
