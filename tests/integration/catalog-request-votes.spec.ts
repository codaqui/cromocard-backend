import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { PrismaCatalogRequestVotesRepository } from '@/domains/catalog/requests/catalog-request-votes.repository';
import type { Prisma } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const VOTING = '/api/v1/catalog-requests';
const ADMIN = '/api/v1/admin/catalog-requests';
const MARKER = `votacao-${crypto.randomUUID().slice(0, 8)}`;
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';

interface Suggestion {
  id: string;
  code: string;
  name: string;
  votes: { for: number; neutral: number; against: number; total: number };
  myVote: string | null;
}

interface AdminItem {
  id: string;
  votes: { total: number; goal: number; forPercent: number; goalPercent: number } | null;
  checklistSummary: { total: number; rarities: { name: string; count: number }[] } | null;
  createdItem?: { id: string; subcategoryIds?: string[] };
}

const tokens = {} as Record<'customer' | 'otherCustomer' | 'seller' | 'admin', string>;
let requesterId: string;
let rarityIds: { comum: string; lendaria: string };

async function createUser(key: string, role: UserRole) {
  const user = await prisma.user.create({
    data: { name: `Votação ${key}`, email: `${MARKER}-${key}@cromocard.dev`, role },
  });
  return { id: user.id, token: signAccessToken({ id: user.id, role }) };
}

async function suggest(type: 'ALBUM' | 'CATEGORY' | 'CARD', data: Prisma.InputJsonObject) {
  const created = await prisma.catalogRequest.create({ data: { requesterId, type, data } });
  return created.id;
}

const category = (name: string, extra: Prisma.InputJsonObject = {}) =>
  suggest('CATEGORY', { name: `${MARKER} ${name}`, type: 'CARD', ...extra });

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const vote = (id: string, value: string, token = tokens.customer) =>
  request(app).put(`${VOTING}/${id}/vote`).set(as(token)).send({ vote: value });
const voting = (token = tokens.customer) =>
  request(app).get(`${VOTING}/voting`).set(as(token)).query({ pageSize: 100 });
const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorOf = (res: request.Response) => (res.body as { error: string }).error;

beforeAll(async () => {
  const customer = await createUser('cliente', 'CUSTOMER');
  const otherCustomer = await createUser('outro', 'CUSTOMER');
  const seller = await createUser('vendedor', 'SELLER');
  const admin = await createUser('admin', 'ADMIN');
  requesterId = customer.id;
  Object.assign(tokens, {
    customer: customer.token,
    otherCustomer: otherCustomer.token,
    seller: seller.token,
    admin: admin.token,
  });
  const upsertRarity = (name: string, sortOrder: number) =>
    prisma.rarity.upsert({ where: { name }, update: {}, create: { name, sortOrder } });
  const [comum, lendaria] = await Promise.all([
    upsertRarity('Comum', 1),
    upsertRarity('Lendária', 5),
  ]);
  rarityIds = { comum: comum.id, lendaria: lendaria.id };
});

afterAll(async () => {
  const users = { email: { startsWith: MARKER } };
  await prisma.catalogRequestVote.deleteMany({ where: { user: users } });
  await prisma.notification.deleteMany({ where: { user: users } });
  await prisma.catalogRequest.deleteMany({ where: { requesterId } });
  await prisma.auditLog.deleteMany({ where: { admin: users } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({ where: { parentCategory: { name: { startsWith: MARKER } } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: users });
});

describe('Votação nas sugestões de categoria (CCD103)', () => {
  it('CA7: votar sem login responde 401', async () => {
    const id = await category('Sem login');

    expect((await request(app).put(`${VOTING}/${id}/vote`).send({ vote: 'FOR' })).status).toBe(401);
    expect((await request(app).get(`${VOTING}/voting`)).status).toBe(401);
  });

  it('CA8: o admin não vota (403) e o vendedor vota normalmente', async () => {
    const id = await category('Admin não vota');

    expect((await vote(id, 'FOR', tokens.admin)).status).toBe(403);
    const res = await vote(id, 'AGAINST', tokens.seller);
    expect(res.status).toBe(200);
    expect(dataOf<Suggestion>(res).myVote).toBe('AGAINST');
  });

  it('CA1: lista a sugestão pendente e o voto a favor faz a contagem subir', async () => {
    const id = await category('Lorcana', { description: 'Card game da Disney.' });
    await vote(id, 'NEUTRAL', tokens.otherCustomer);

    const res = await vote(id, 'FOR');

    expect(res.status).toBe(200);
    expect(dataOf<Suggestion>(res)).toMatchObject({
      code: `#SOL-${id.slice(-4).toUpperCase()}`,
      votes: { for: 1, neutral: 1, against: 0, total: 2 },
      myVote: 'FOR',
    });
    const listed = dataOf<Suggestion[]>(await voting()).find((item) => item.id === id);
    expect(listed).toMatchObject({ name: `${MARKER} Lorcana`, myVote: 'FOR', votes: { total: 2 } });
  });

  it('CA2: votar de novo troca o voto e o total não muda', async () => {
    const id = await category('Troca');
    await vote(id, 'AGAINST');

    const res = await vote(id, 'FOR');

    expect(dataOf<Suggestion>(res).votes).toEqual({ for: 1, neutral: 0, against: 0, total: 1 });
    expect(await prisma.catalogRequestVote.count({ where: { catalogRequestId: id } })).toBe(1);
  });

  it('CA3: sugestão aprovada responde 409 VOTING_CLOSED e sai da lista', async () => {
    const id = await category('Encerrada');
    await prisma.catalogRequest.update({ where: { id }, data: { status: 'APPROVED' } });

    const res = await vote(id, 'FOR');

    expect(res.status).toBe(409);
    expect(errorOf(res)).toBe('VOTING_CLOSED');
    expect(dataOf<Suggestion[]>(await voting()).map((item) => item.id)).not.toContain(id);
  });

  it('voto inválido responde 400; sugestão que não é categoria ou não existe, 404', async () => {
    const cardId = await suggest('CARD', { name: `${MARKER} Carta` });

    expect((await vote(cardId, 'TALVEZ')).status).toBe(400);
    expect((await vote(cardId, 'FOR')).status).toBe(404);
    expect((await vote(UNKNOWN_ID, 'FOR')).status).toBe(404);
  });
});

describe('Quórum, checklist e subcategorias na fila (CCD103)', () => {
  const asAdmin = (path = '') => request(app).get(`${ADMIN}${path}`).set(as(tokens.admin));

  it('CA4: o cartão da categoria mostra o total, a meta e os percentuais', async () => {
    const id = await category('Quórum');
    await vote(id, 'FOR');
    await vote(id, 'AGAINST', tokens.seller);

    const res = await asAdmin(`/${id}`);

    expect(res.status).toBe(200);
    const { votes } = dataOf<AdminItem>(res);
    expect(votes).toMatchObject({ total: 2, forPercent: 50 });
    expect(votes?.goalPercent).toBe(Math.round((2 / votes!.goal) * 1000) / 10);
  });

  it('CA6: baixa o checklist do álbum em CSV e mostra o resumo por raridade', async () => {
    const id = await suggest('ALBUM', {
      title: `${MARKER} Jungle`,
      checklist: [
        {
          number: '001',
          code: 'JU-001',
          name: 'Clefable',
          rarityId: rarityIds.lendaria,
          variants: 'Holo',
        },
        { number: '051', code: 'JU-051', name: 'Eevee', rarityId: rarityIds.comum, variants: '' },
      ],
    });

    const detail = dataOf<AdminItem>(await asAdmin(`/${id}`));
    const csv = await asAdmin(`/${id}/checklist.csv`);

    expect(detail.checklistSummary).toEqual({
      total: 2,
      rarities: [
        { name: 'Lendária', count: 1 },
        { name: 'Comum', count: 1 },
      ],
    });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(
      `checklist-SOL-${id.slice(-4).toUpperCase()}.csv`,
    );
    expect(csv.text.split('\r\n').slice(1, 3)).toEqual([
      '001;JU-001;Clefable;Lendária;Holo',
      '051;JU-051;Eevee;Comum;',
    ]);
  });

  it('álbum sem checklist responde 404 CHECKLIST_NOT_FOUND', async () => {
    const id = await suggest('ALBUM', { title: `${MARKER} Sem checklist` });

    const res = await asAdmin(`/${id}/checklist.csv`);

    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe('CHECKLIST_NOT_FOUND');
  });

  it('CA5: aprovar a categoria cria as 3 subcategorias e encerra a votação', async () => {
    const subcategories = ['The First Chapter', 'Rise of the Floodborn', 'Into the Inklands'];
    const id = await category('Disney Lorcana', { subcategories });

    const res = await request(app).post(`${ADMIN}/${id}/approve`).set(as(tokens.admin));

    expect(res.status).toBe(200);
    const parentId = dataOf<AdminItem>(res).createdItem!.id;
    const children = await prisma.category.findMany({
      where: { parentCategoryId: parentId },
      select: { name: true, type: true },
      orderBy: { name: 'asc' },
    });
    expect(children).toEqual([...subcategories].sort().map((name) => ({ name, type: 'CARD' })));
    expect(errorOf(await vote(id, 'FOR'))).toBe('VOTING_CLOSED');
  });
});

describe('Voto e aprovação ao mesmo tempo (CCD103, R8)', () => {
  const repository = new PrismaCatalogRequestVotesRepository(prisma);
  const votesOn = (catalogRequestId: string) =>
    prisma.catalogRequestVote.count({ where: { catalogRequestId } });

  it('não grava o voto numa sugestão que já foi aprovada', async () => {
    const voter = await createUser('trava-aprovada', 'CUSTOMER');
    const id = await category('Já aprovada');
    await prisma.catalogRequest.update({ where: { id }, data: { status: 'APPROVED' } });

    const saved = await repository.saveVote({
      catalogRequestId: id,
      userId: voter.id,
      vote: 'FOR',
    });

    expect(saved).toBe(false);
    await expect(votesOn(id)).resolves.toBe(0);
  });

  it('o voto espera a aprovação em andamento e não entra depois dela', async () => {
    const voter = await createUser('trava-andamento', 'CUSTOMER');
    const id = await category('Aprovando');
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let approvalStarted = () => undefined as void;
    const started = new Promise<void>((resolve) => (approvalStarted = resolve));
    const approving = prisma.$transaction(
      async (tx) => {
        await tx.catalogRequest.update({ where: { id }, data: { status: 'APPROVED' } });
        approvalStarted();
        await gate;
      },
      { timeout: 10_000 },
    );
    await started;

    const voting = repository.saveVote({ catalogRequestId: id, userId: voter.id, vote: 'FOR' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await approving;

    await expect(voting).resolves.toBe(false);
    await expect(votesOn(id)).resolves.toBe(0);
  });
});
