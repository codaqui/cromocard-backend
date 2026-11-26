import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { chatService } from '@/domains/chat/chat.module';
import { createChatSocketHandlers } from '@/domains/chat/chat.socket';
import { PresenceRegistry } from '@/domains/chat/presence.registry';
import { prisma } from '@/lib/prisma';
import { createSocketServer } from '@/socket/socket-server';
import type { AckResponse, AppSocketServer } from '@/socket/socket.types';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const MARKER = `sock${crypto.randomUUID().slice(0, 6)}`;
const fx = new ChatFixtures(MARKER);

interface Message {
  id: string;
  conversationId: string;
  content: string;
  author: { id: string };
  replyTo: { id: string; content?: string; unavailable: boolean } | null;
}

let httpServer: HttpServer;
let io: AppSocketServer;
let url: string;
const clients: ClientSocket[] = [];
let ana: TestUser;
let elisa: TestUser;
let carla: TestUser;
let conversationId: string;

async function online(user: TestUser): Promise<ClientSocket> {
  const socket = connect(url, {
    auth: { token: user.token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

const emit = <T>(socket: ClientSocket, event: string, payload: unknown) =>
  socket.timeout(2000).emitWithAck(event, payload) as Promise<AckResponse<T>>;

const next = <T>(socket: ClientSocket, event: string) =>
  new Promise<T>((resolve) => socket.once(event, resolve));

const silence = (socket: ClientSocket, event: string) =>
  new Promise<boolean>((resolve) => {
    socket.once(event, () => resolve(false));
    setTimeout(() => resolve(true), 300);
  });

beforeAll(async () => {
  ana = await fx.createUser('ana');
  elisa = await fx.createUser('elisa', 'SELLER');
  carla = await fx.createUser('carla');
  conversationId = await fx.createConversation(ana, elisa);
  httpServer = createServer();
  io = createSocketServer(httpServer, {
    handlers: [
      createChatSocketHandlers({ service: chatService, presence: new PresenceRegistry() }),
    ],
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  clients.splice(0).forEach((socket) => socket.disconnect());
});

afterAll(async () => {
  await io.close();
  await fx.cleanup();
});

describe('conversa em tempo real (R8, R18)', () => {
  it('CA6 e CA16: a mensagem é gravada e chega na conversa aberta do outro e na lista de quem enviou', async () => {
    const anaSocket = await online(ana);
    const elisaSocket = await online(elisa);
    await emit(elisaSocket, 'conversation:join', { conversationId });
    const atElisa = next<Message>(elisaSocket, 'message:new');
    const atAnaList = next<Message>(anaSocket, 'message:new');

    const ack = await emit<Message>(anaSocket, 'message:send', {
      conversationId,
      content: '  Combinado, compro pelo anúncio.  ',
    });

    expect(ack).toMatchObject({
      data: { content: 'Combinado, compro pelo anúncio.', author: { id: ana.id } },
    });
    expect((await atElisa).content).toBe('Combinado, compro pelo anúncio.');
    expect((await atAnaList).conversationId).toBe(conversationId);
    await expect(prisma.message.count({ where: { conversationId } })).resolves.toBe(1);
  });

  it('CA7: quem não participa não entra na sala nem envia, e nada é emitido', async () => {
    const carlaSocket = await online(carla);
    const elisaSocket = await online(elisa);
    const quiet = silence(elisaSocket, 'message:new');

    const join = await emit(carlaSocket, 'conversation:join', { conversationId });
    const send = await emit(carlaSocket, 'message:send', { conversationId, content: 'Oi' });

    expect(join).toMatchObject({ error: 'CONVERSATION_NOT_FOUND' });
    expect(send).toMatchObject({ error: 'CONVERSATION_NOT_FOUND' });
    expect(await quiet).toBe(true);
  });

  it('CA5: com bloqueio, nenhum dos dois envia, e nada é gravado nem emitido', async () => {
    const gabriel = await fx.createUser('gabriel');
    const marcos = await fx.createUser('marcos');
    const blockedConversation = await fx.createConversation(gabriel, marcos);
    await fx.block(gabriel, marcos);
    const gabrielSocket = await online(gabriel);
    const marcosSocket = await online(marcos);
    await emit(marcosSocket, 'conversation:join', { conversationId: blockedConversation });
    const quiet = silence(marcosSocket, 'message:new');
    const payload = { conversationId: blockedConversation, content: 'Oi' };

    const fromBlocker = await emit(gabrielSocket, 'message:send', payload);
    const fromBlocked = await emit(marcosSocket, 'message:send', payload);

    expect(fromBlocker).toMatchObject({ error: 'CONTACT_BLOCKED' });
    expect(fromBlocked).toMatchObject({ error: 'CONTACT_BLOCKED' });
    expect(await quiet).toBe(true);
    await expect(
      prisma.message.count({ where: { conversationId: blockedConversation } }),
    ).resolves.toBe(0);
  });

  it('CA16: mensagem vazia volta como VALIDATION_ERROR, sem gravar', async () => {
    const anaSocket = await online(ana);
    const before = await prisma.message.count({ where: { conversationId } });

    const ack = await emit(anaSocket, 'message:send', { conversationId, content: '   ' });

    expect(ack).toMatchObject({ error: 'VALIDATION_ERROR' });
    await expect(prisma.message.count({ where: { conversationId } })).resolves.toBe(before);
  });

  it('sai da sala da conversa e deixa de receber nela', async () => {
    const elisaSocket = await online(elisa);
    await emit(elisaSocket, 'conversation:join', { conversationId });

    const ack = await emit(elisaSocket, 'conversation:leave', { conversationId });

    expect(ack).toEqual({ data: { conversationId } });
    expect(io.sockets.adapter.rooms.get(`conversation:${conversationId}`)).toBeUndefined();
  });
});

describe('responder uma mensagem (CCD045)', () => {
  async function chatWithQuote() {
    const rafa = await fx.createUser(`rafa${crypto.randomUUID().slice(0, 4)}`);
    const bia = await fx.createUser(`bia${crypto.randomUUID().slice(0, 4)}`);
    const id = await fx.createConversation(rafa, bia);
    const quoted = await fx.say({ conversationId: id, author: bia, content: 'Tenho o Zekrom-EX.' });
    return { rafa, bia, id, quoted };
  }

  it('CA1: grava a resposta com a citação, e ela chega aos dois já com o trecho citado', async () => {
    const { rafa, bia, id, quoted } = await chatWithQuote();
    const rafaSocket = await online(rafa);
    const biaSocket = await online(bia);
    await emit(biaSocket, 'conversation:join', { conversationId: id });
    const atBia = next<Message>(biaSocket, 'message:new');

    const ack = await emit<Message>(rafaSocket, 'message:send', {
      conversationId: id,
      content: 'Quero sim',
      replyToId: quoted.id,
    });

    const replyTo = { id: quoted.id, content: 'Tenho o Zekrom-EX.', unavailable: false };
    expect(ack).toMatchObject({ data: { replyTo } });
    expect((await atBia).replyTo).toMatchObject(replyTo);
    await expect(
      prisma.message.count({ where: { conversationId: id, replyToId: quoted.id } }),
    ).resolves.toBe(1);
  });

  it('CA5: citação de outra conversa volta como VALIDATION_ERROR, sem gravar nem emitir', async () => {
    const { rafa, bia, id } = await chatWithQuote();
    const otherConversation = await fx.createConversation(bia, carla);
    const other = await fx.say({
      conversationId: otherConversation,
      author: carla,
      content: 'De outra conversa',
    });
    const rafaSocket = await online(rafa);
    const biaSocket = await online(bia);
    await emit(biaSocket, 'conversation:join', { conversationId: id });
    const quiet = silence(biaSocket, 'message:new');

    const ack = await emit(rafaSocket, 'message:send', {
      conversationId: id,
      content: 'Oi',
      replyToId: other.id,
    });

    expect(ack).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(await quiet).toBe(true);
    await expect(prisma.message.count({ where: { conversationId: id } })).resolves.toBe(1);
  });

  it('CA4: citação de mensagem excluída volta como REPLY_TARGET_UNAVAILABLE, sem gravar', async () => {
    const { rafa, id, quoted } = await chatWithQuote();
    await prisma.message.update({ where: { id: quoted.id }, data: { deletedAt: new Date() } });
    const rafaSocket = await online(rafa);

    const ack = await emit(rafaSocket, 'message:send', {
      conversationId: id,
      content: 'Quero sim',
      replyToId: quoted.id,
    });

    expect(ack).toMatchObject({ error: 'REPLY_TARGET_UNAVAILABLE' });
    await expect(prisma.message.count({ where: { conversationId: id } })).resolves.toBe(1);
  });

  it('CA6: quem não participa recebe CONVERSATION_NOT_FOUND ao responder', async () => {
    const { id, quoted } = await chatWithQuote();
    const carlaSocket = await online(carla);

    const ack = await emit(carlaSocket, 'message:send', {
      conversationId: id,
      content: 'Oi',
      replyToId: quoted.id,
    });

    expect(ack).toMatchObject({ error: 'CONVERSATION_NOT_FOUND' });
  });

  it('CA8: com bloqueio, a resposta é recusada nos dois sentidos', async () => {
    const { rafa, bia, id, quoted } = await chatWithQuote();
    await fx.block(bia, rafa);
    const payload = { conversationId: id, content: 'Oi', replyToId: quoted.id };

    const fromBlocked = await emit(await online(rafa), 'message:send', payload);
    const fromBlocker = await emit(await online(bia), 'message:send', payload);

    expect(fromBlocked).toMatchObject({ error: 'CONTACT_BLOCKED' });
    expect(fromBlocker).toMatchObject({ error: 'CONTACT_BLOCKED' });
    await expect(prisma.message.count({ where: { conversationId: id } })).resolves.toBe(1);
  });
});

describe('presença (R15)', () => {
  it('CA15: avisa quem conversa com ele ao ficar online e offline, e responde a lista', async () => {
    const anaSocket = await online(ana);
    const cameOnline = next<{ userId: string; online: boolean }>(anaSocket, 'presence:changed');

    const elisaSocket = await online(elisa);
    expect(await cameOnline).toEqual({ userId: elisa.id, online: true });
    await expect(
      emit(anaSocket, 'presence:list', { userIds: [elisa.id, carla.id] }),
    ).resolves.toEqual({
      data: { online: [elisa.id] },
    });

    const wentOffline = next<{ userId: string; online: boolean }>(anaSocket, 'presence:changed');
    elisaSocket.disconnect();
    expect(await wentOffline).toEqual({ userId: elisa.id, online: false });
  });

  it('com duas abas abertas, só avisa online na primeira e offline ao fechar a última', async () => {
    const anaSocket = await online(ana);
    const firstTab = next<{ online: boolean }>(anaSocket, 'presence:changed');
    const elisaTab1 = await online(elisa);
    await firstTab;

    const noDuplicate = silence(anaSocket, 'presence:changed');
    const elisaTab2 = await online(elisa);
    elisaTab1.disconnect();
    expect(await noDuplicate).toBe(true);

    const offline = next<{ online: boolean }>(anaSocket, 'presence:changed');
    elisaTab2.disconnect();
    expect(await offline).toEqual({ userId: elisa.id, online: false });
  });

  it('quem não tem conversa com ele não é avisado', async () => {
    const carlaSocket = await online(carla);
    const quiet = silence(carlaSocket, 'presence:changed');

    await online(elisa);

    expect(await quiet).toBe(true);
  });
});
