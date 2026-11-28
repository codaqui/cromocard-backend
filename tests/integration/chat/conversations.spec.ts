import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const app = createApp();
const BASE = '/api/v1/me/conversations';
const MARKER = `chat${crypto.randomUUID().slice(0, 6)}`;
const fx = new ChatFixtures(MARKER);

interface Summary {
  id: string;
  contact: {
    id: string;
    name: string;
    username: string;
    verified: boolean;
    avatarUrl: string | null;
  };
  lastMessage: { content: string; fromMe: boolean } | null;
  unreadCount: number;
  block: 'BY_ME' | 'BY_CONTACT' | null;
}
interface ListMeta {
  total: number;
  totals: { all: number; unread: number };
}
interface Msg {
  id: string;
  content: string;
}

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const metaOf = <T>(res: request.Response) => (res.body as { meta: T }).meta;

let ana: TestUser;
let elisa: TestUser;
let bruno: TestUser;
let carla: TestUser;
let fabio: TestUser;
let withElisa: string;
let withBruno: string;

beforeAll(async () => {
  ana = await fx.createUser('ana');
  elisa = await fx.createUser('elisa', 'SELLER');
  bruno = await fx.createUser('renata');
  carla = await fx.createUser('carla');
  fabio = await fx.createUser('fabio', 'SELLER');
  await prisma.sellerVerification.create({
    data: {
      userId: elisa.id,
      status: 'APPROVED',
      legalName: `${MARKER} Elisa LTDA`,
      responsibleName: 'Elisa',
      responsibleCpf: '52998224725',
      cnpj: MARKER.slice(0, 18),
    },
  });
  withElisa = await fx.createConversation(ana, elisa);
  withBruno = await fx.createConversation(ana, bruno);
  const withCarla = await fx.createConversation(ana, carla);
  await fx.createConversation(ana, fabio);
  await fx.say({
    conversationId: withElisa,
    author: elisa,
    content: 'Olá Ana!',
    minutesAgo: 30,
    isRead: true,
  });
  await fx.say({
    conversationId: withElisa,
    author: elisa,
    content: 'Mensagem apagada',
    minutesAgo: 20,
    deleted: true,
  });
  await fx.say({
    conversationId: withElisa,
    author: ana,
    content: 'Combinado, compro pelo anúncio.',
    minutesAgo: 10,
    isRead: true,
  });
  await fx.say({
    conversationId: withBruno,
    author: bruno,
    content: 'Te mandei o link do anúncio',
    minutesAgo: 60,
  });
  await fx.say({
    conversationId: withCarla,
    author: carla,
    content: 'Viu as fotos da carta?',
    minutesAgo: 1440,
  });
});

afterAll(async () => {
  await prisma.sellerVerification.deleteMany({ where: { userId: elisa.id } });
  await fx.cleanup();
});

describe('GET /me/conversations', () => {
  it('CA1 e CA2: lista da última mensagem mais recente para a mais antiga (a recém-criada pela data dela), com o contato e o "Você"', async () => {
    const res = await request(app).get(BASE).set(as(ana));
    const items = dataOf<Summary[]>(res);

    expect(res.status).toBe(200);
    expect(items.map(({ contact }) => contact.id)).toEqual([
      fabio.id,
      elisa.id,
      bruno.id,
      carla.id,
    ]);
    expect(items[1]).toMatchObject({
      contact: {
        name: `${MARKER} elisa`,
        username: `${MARKER}_elisa`,
        avatarUrl: null,
        verified: true,
      },
      lastMessage: { content: 'Combinado, compro pelo anúncio.', fromMe: true },
      unreadCount: 0,
    });
    expect(items[0]?.lastMessage).toBeNull();
    expect(metaOf<ListMeta>(res)).toMatchObject({ total: 4, totals: { all: 4, unread: 2 } });
  });

  it('CA15: só o vendedor com a verificação aprovada tem o selo', async () => {
    const items = dataOf<Summary[]>(await request(app).get(BASE).set(as(ana)));

    expect(
      items.filter(({ contact }) => contact.verified).map(({ contact }) => contact.id),
    ).toEqual([elisa.id]);
  });

  it('CA12: busca pelo nome ou pelo @, e a aba Não Lidas, sem mudar os totais', async () => {
    const search = await request(app).get(BASE).set(as(ana)).query({ q: 'RENATA' });
    const unread = await request(app).get(BASE).set(as(ana)).query({ filter: 'unread' });

    expect(dataOf<Summary[]>(search).map(({ contact }) => contact.id)).toEqual([bruno.id]);
    expect(metaOf<ListMeta>(search)).toMatchObject({ total: 1, totals: { all: 4, unread: 2 } });
    expect(dataOf<Summary[]>(unread).map(({ unreadCount }) => unreadCount)).toEqual([1, 1]);
  });

  it('CA4: quem não tem conversa recebe a lista vazia e os totais zerados', async () => {
    const novo = await fx.createUser('novo');

    const res = await request(app).get(BASE).set(as(novo));

    expect(dataOf<Summary[]>(res)).toEqual([]);
    expect(metaOf<ListMeta>(res)).toMatchObject({ total: 0, totals: { all: 0, unread: 0 } });
  });

  it('mensagem sem texto (anexo, fase Futuro) vira prévia vazia', async () => {
    const outro = await fx.createUser('anexo');
    const id = await fx.createConversation(ana, outro);
    await prisma.message.create({
      data: { conversationId: id, authorId: outro.id, attachmentUrl: '/uploads/a.png' },
    });

    const items = dataOf<Summary[]>(
      await request(app).get(BASE).set(as(ana)).query({ q: 'anexo' }),
    );

    expect(items[0]?.lastMessage).toMatchObject({ content: '', fromMe: false });
  });

  it('R8 e R17: cada lado vê de quem é o bloqueio, e a conversa sem bloqueio vem nula', async () => {
    const gabriel = await fx.createUser('gabriel');
    const marcos = await fx.createUser('marcos');
    await fx.createConversation(gabriel, marcos);
    await fx.block(gabriel, marcos);

    const blockOf = async (user: TestUser) =>
      dataOf<Summary[]>(await request(app).get(BASE).set(as(user)))[0]?.block;

    expect(await blockOf(gabriel)).toBe('BY_ME');
    expect(await blockOf(marcos)).toBe('BY_CONTACT');
    const anaList = dataOf<Summary[]>(await request(app).get(BASE).set(as(ana)));
    expect(anaList.every(({ block }) => block === null)).toBe(true);
  });

  it('CA7: 401 sem token e 403 para o administrador', async () => {
    const admin = await fx.createUser('admin', 'ADMIN');

    expect((await request(app).get(BASE)).status).toBe(401);
    expect((await request(app).get(BASE).set(as(admin))).status).toBe(403);
  });
});

describe('mensagens da conversa', () => {
  it('CA1 e CA8: em ordem cronológica, sem a mensagem apagada', async () => {
    const res = await request(app).get(`${BASE}/${withElisa}/messages`).set(as(ana));

    expect(res.status).toBe(200);
    expect(dataOf<Msg[]>(res).map(({ content }) => content)).toEqual([
      'Olá Ana!',
      'Combinado, compro pelo anúncio.',
    ]);
    expect(metaOf<{ nextCursor: null }>(res).nextCursor).toBeNull();
  });

  it('R4: carrega por página e traz as anteriores pelo cursor', async () => {
    const first = await request(app)
      .get(`${BASE}/${withElisa}/messages`)
      .set(as(ana))
      .query({ limit: 1 });
    const cursor = metaOf<{ nextCursor: string }>(first).nextCursor;
    const older = await request(app)
      .get(`${BASE}/${withElisa}/messages`)
      .set(as(ana))
      .query({ limit: 1, cursor });

    expect(dataOf<Msg[]>(first).map(({ content }) => content)).toEqual([
      'Combinado, compro pelo anúncio.',
    ]);
    expect(dataOf<Msg[]>(older).map(({ content }) => content)).toEqual(['Olá Ana!']);
  });

  it('R4: a ordem segue a data de envio, mesmo quando o id não acompanha', async () => {
    const outro = await fx.createUser('ordem');
    const id = await fx.createConversation(ana, outro);
    await fx.say({ conversationId: id, author: outro, content: 'Terceira', minutesAgo: 1 });
    await fx.say({ conversationId: id, author: outro, content: 'Primeira', minutesAgo: 30 });
    await fx.say({ conversationId: id, author: ana, content: 'Segunda', minutesAgo: 10 });

    const all = await request(app).get(`${BASE}/${id}/messages`).set(as(ana));
    const recent = await request(app)
      .get(`${BASE}/${id}/messages`)
      .set(as(ana))
      .query({ limit: 2 });
    const cursor = metaOf<{ nextCursor: string }>(recent).nextCursor;
    const older = await request(app)
      .get(`${BASE}/${id}/messages`)
      .set(as(ana))
      .query({ limit: 2, cursor });

    expect(dataOf<Msg[]>(all).map(({ content }) => content)).toEqual([
      'Primeira',
      'Segunda',
      'Terceira',
    ]);
    expect(dataOf<Msg[]>(recent).map(({ content }) => content)).toEqual(['Segunda', 'Terceira']);
    expect(dataOf<Msg[]>(older).map(({ content }) => content)).toEqual(['Primeira']);
  });

  it('CA3: abrir a conversa marca as recebidas como lidas e zera o contador', async () => {
    const read = await request(app).post(`${BASE}/${withBruno}/read`).set(as(ana));
    const items = dataOf<Summary[]>(await request(app).get(BASE).set(as(ana)));
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId: withBruno } });

    expect(read.status).toBe(204);
    expect(items.find(({ id }) => id === withBruno)?.unreadCount).toBe(0);
    expect(message).toMatchObject({ isRead: true, readAt: expect.any(Date) as Date });
  });

  it('CA7: a conversa de outras duas pessoas responde 404', async () => {
    const res = await request(app).get(`${BASE}/${withElisa}/messages`).set(as(carla));
    const read = await request(app).post(`${BASE}/${withElisa}/read`).set(as(carla));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'CONVERSATION_NOT_FOUND' });
    expect(read.status).toBe(404);
  });
});

describe('POST /me/conversations (Nova conversa)', () => {
  it('CA13: cria a conversa uma vez e depois reaproveita', async () => {
    const renan = await fx.createUser('renan');

    const created = await request(app).post(BASE).set(as(ana)).send({ userId: renan.id });
    const again = await request(app).post(BASE).set(as(ana)).send({ userId: renan.id });

    expect(created.status).toBe(201);
    expect(again.status).toBe(200);
    expect(dataOf<Summary>(again).id).toBe(dataOf<Summary>(created).id);
    expect(dataOf<Summary>(created)).toMatchObject({
      contact: { id: renan.id },
      lastMessage: null,
      unreadCount: 0,
    });
  });

  it('CA14: recusa com 404 o bloqueado e o próprio usuário', async () => {
    const blocked = await fx.createUser('bloqueado');
    await prisma.userBlock.create({ data: { blockerId: blocked.id, blockedId: ana.id } });

    const res = await request(app).post(BASE).set(as(ana)).send({ userId: blocked.id });
    const self = await request(app).post(BASE).set(as(ana)).send({ userId: ana.id });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'USER_NOT_FOUND' });
    expect(self.status).toBe(404);
  });

  it('CA13: dois pedidos ao mesmo tempo para a mesma pessoa criam uma conversa só', async () => {
    const tiago = await fx.createUser('tiago');

    const [first, second] = await Promise.all([
      request(app).post(BASE).set(as(ana)).send({ userId: tiago.id }),
      request(app).post(BASE).set(as(ana)).send({ userId: tiago.id }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(dataOf<Summary>(first).id).toBe(dataOf<Summary>(second).id);
    const between = await prisma.conversation.count({
      where: {
        AND: [ana, tiago].map(({ id }) => ({ participants: { some: { userId: id } } })),
      },
    });
    expect(between).toBe(1);
  });

  it('L17: traz a foto do perfil do contato, e null para quem não tem foto', async () => {
    const photo = 'https://cdn.cromocard.dev/avatars/paula.png';
    const paula = await fx.createUser('paula', 'CUSTOMER', {
      profile: { create: { avatarUrl: photo } },
    });

    const res = await request(app).post(BASE).set(as(ana)).send({ userId: paula.id });
    const list = await request(app).get(BASE).set(as(ana)).query({ q: 'elisa' });

    expect(dataOf<Summary>(res).contact.avatarUrl).toBe(photo);
    expect(dataOf<Summary[]>(list)[0]?.contact.avatarUrl).toBeNull();
  });

  it('recusa userId que não é UUID', async () => {
    expect((await request(app).post(BASE).set(as(ana)).send({ userId: 'x' })).status).toBe(400);
  });
});
