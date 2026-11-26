import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const app = createApp({ withUploads: true });
const MARKER = `mod${crypto.randomUUID().slice(0, 6)}`;
const fx = new ChatFixtures(MARKER);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIVE_MEGABYTES = 5 * 1024 * 1024;

interface ErrorBody {
  error: string;
}
interface Report {
  id: string;
  status: string;
  blocked: boolean;
}
interface Blocked {
  userId: string;
}

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorOf = (res: request.Response) => (res.body as ErrorBody).error;

function png(size = 64): Buffer {
  const content = Buffer.alloc(size);
  PNG_SIGNATURE.copy(content);
  return content;
}

interface ReportForm {
  reporter: TestUser;
  target: TestUser;
  block?: boolean;
  reason?: string;
  prints?: Buffer[];
}

function postReport({ reporter, target, block = true, reason = 'Assédio', prints }: ReportForm) {
  const req = request(app)
    .post('/api/v1/me/contact-reports')
    .set(as(reporter))
    .field('userId', target.id)
    .field('reason', reason)
    .field('description', 'Mensagens ofensivas depois da troca.')
    .field('block', String(block));
  return (prints ?? [png()]).reduce(
    (pending, print, index) => pending.attach('evidences', print, `print-${index}.png`),
    req,
  );
}

const isBlocked = async (blocker: TestUser, blocked: TestUser) =>
  (await prisma.userBlock.count({
    where: { blockerId: blocker.id, blockedId: blocked.id, deletedAt: null },
  })) > 0;

const reportsAgainst = (target: TestUser) =>
  prisma.report.findMany({ where: { targetUserId: target.id }, include: { evidences: true } });

let gabriel: TestUser;

beforeAll(async () => {
  gabriel = await fx.createUser('gabriel');
});

afterAll(async () => {
  await fx.cleanup();
});

async function contactOfGabriel(key: string) {
  const contact = await fx.createUser(key);
  await fx.createConversation(gabriel, contact);
  return contact;
}

describe('POST /me/contact-reports', () => {
  it('CA1: bloqueia e denuncia, com o print gravado como evidência', async () => {
    const marcos = await contactOfGabriel('marcos');

    const res = await postReport({ reporter: gabriel, target: marcos, prints: [png(), png()] });

    expect(res.status).toBe(201);
    expect(dataOf<Report>(res)).toMatchObject({ status: 'PENDING', blocked: true });
    const [report] = await reportsAgainst(marcos);
    expect(report).toMatchObject({ targetType: 'USER', reason: 'Assédio', status: 'PENDING' });
    expect(report?.evidences.map(({ sortOrder }) => sortOrder)).toEqual([0, 1]);
    expect(report?.evidences[0]?.url).toMatch(/report-evidences\/.+\.png$/);
    expect(await isBlocked(gabriel, marcos)).toBe(true);
  });

  it('CA3: Somente denunciar grava a denúncia sem bloquear', async () => {
    const lia = await contactOfGabriel('lia');

    const res = await postReport({ reporter: gabriel, target: lia, block: false });

    expect(dataOf<Report>(res).blocked).toBe(false);
    expect(await reportsAgainst(lia)).toHaveLength(1);
    expect(await isBlocked(gabriel, lia)).toBe(false);
  });

  it.each([
    ['sem motivo', { reason: '' }],
    ['sem print', { prints: [] }],
    ['com um arquivo que não é imagem', { prints: [Buffer.from('texto')] }],
    ['com 4 prints', { prints: [png(), png(), png(), png()] }],
  ])('CA4 e CA15: recusa a denúncia %s com 400, sem gravar', async (_case, changes) => {
    const nina = await contactOfGabriel(`nina${Math.random().toString(36).slice(2, 6)}`);

    const res = await postReport({ reporter: gabriel, target: nina, ...changes });

    expect(res.status).toBe(400);
    expect(errorOf(res)).toBe('VALIDATION_ERROR');
    expect(await reportsAgainst(nina)).toHaveLength(0);
    expect(await isBlocked(gabriel, nina)).toBe(false);
  });

  it('CA4: recusa a denúncia enviada sem multipart, sem nenhum print', async () => {
    const lara = await contactOfGabriel('lara');

    const res = await request(app)
      .post('/api/v1/me/contact-reports')
      .set(as(gabriel))
      .send({ userId: lara.id, reason: 'Spam' });

    expect(res.status).toBe(400);
    expect(await reportsAgainst(lara)).toHaveLength(0);
  });

  it('CA15: recusa print acima de 4 MB com 413', async () => {
    const otto = await contactOfGabriel('otto');

    const res = await postReport({
      reporter: gabriel,
      target: otto,
      prints: [png(FIVE_MEGABYTES)],
    });

    expect(res.status).toBe(413);
    expect(errorOf(res)).toBe('FILE_TOO_LARGE');
  });

  it('CA17: recusa a segunda denúncia enquanto a primeira está pendente, e aceita depois de dispensada', async () => {
    const rui = await contactOfGabriel('rui');
    await postReport({ reporter: gabriel, target: rui, block: false });

    const again = await postReport({ reporter: gabriel, target: rui, block: false });
    await prisma.report.updateMany({
      where: { targetUserId: rui.id },
      data: { status: 'DISMISSED' },
    });
    const afterDismiss = await postReport({ reporter: gabriel, target: rui, block: false });

    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe('REPORT_ALREADY_PENDING');
    expect(afterDismiss.status).toBe(201);
    expect(await reportsAgainst(rui)).toHaveLength(2);
  });
});

describe('bloqueio', () => {
  it('CA2, CA7 e CA8: bloqueia, desbloqueia e bloqueia de novo restaurando a mesma linha', async () => {
    const teo = await contactOfGabriel('teo');
    const blocks = request(app);

    const first = await blocks.post('/api/v1/me/blocks').set(as(gabriel)).send({ userId: teo.id });
    const unblock = await blocks.delete(`/api/v1/me/blocks/${teo.id}`).set(as(gabriel));
    const again = await blocks.post('/api/v1/me/blocks').set(as(gabriel)).send({ userId: teo.id });

    expect(first.status).toBe(201);
    expect(unblock.status).toBe(204);
    expect(again.status).toBe(201);
    await expect(
      prisma.userBlock.count({ where: { blockerId: gabriel.id, blockedId: teo.id } }),
    ).resolves.toBe(1);
    expect(await isBlocked(gabriel, teo)).toBe(true);
  });

  it('desbloquear quem não está bloqueado responde 404', async () => {
    const ivo = await contactOfGabriel('ivo');

    const res = await request(app).delete(`/api/v1/me/blocks/${ivo.id}`).set(as(gabriel));

    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe('BLOCK_NOT_FOUND');
  });

  it('CA9: lista os bloqueados com o total, e a lista esvazia ao desbloquear', async () => {
    const helena = await fx.createUser('helena');
    const caio = await fx.createUser('caio');
    await fx.createConversation(helena, caio);
    await fx.block(helena, caio);
    const list = () => request(app).get('/api/v1/me/blocks').set(as(helena));

    const before = await list();
    await request(app).delete(`/api/v1/me/blocks/${caio.id}`).set(as(helena));
    const after = await list();

    expect(dataOf<Blocked[]>(before).map(({ userId }) => userId)).toEqual([caio.id]);
    expect((before.body as { meta: { total: number } }).meta.total).toBe(1);
    expect(dataOf<Blocked[]>(after)).toEqual([]);
  });
});

describe('acesso (R1)', () => {
  it('CA10: 401 sem token e 403 para o administrador', async () => {
    const admin = await fx.createUser('admin', 'ADMIN');

    const anonymous = await request(app).post('/api/v1/me/blocks').send({ userId: gabriel.id });
    const byAdmin = await request(app).get('/api/v1/me/blocks').set(as(admin));

    expect(anonymous.status).toBe(401);
    expect(byAdmin.status).toBe(403);
  });

  it('CA10: recusa moderar a si mesmo (400) e quem não tem conversa com ele (404)', async () => {
    const stranger = await fx.createUser('estranho');

    const self = await request(app)
      .post('/api/v1/me/blocks')
      .set(as(gabriel))
      .send({ userId: gabriel.id });
    const noConversation = await postReport({ reporter: gabriel, target: stranger });

    expect(self.status).toBe(400);
    expect(errorOf(self)).toBe('CANNOT_MODERATE_SELF');
    expect(noConversation.status).toBe(404);
    expect(errorOf(noConversation)).toBe('CONTACT_NOT_FOUND');
  });
});
