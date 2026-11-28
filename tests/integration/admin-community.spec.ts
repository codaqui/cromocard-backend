import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { createStorageProvider } from '@/providers/storage/storage.factory';

type Method = 'get' | 'post' | 'delete';

interface GroupBody {
  id: string;
  status: string;
}

interface ErrorBody {
  error: string;
}

const suffix = crypto.randomUUID().slice(0, 8);
const REASON = { reason: 'Mensagens fora das regras' };
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';

let userIds: string[] = [];
let adminId: string;
let reporterId: string;
let groupId: string;
let suspendedGroupId: string;
let warnableGroupId: string;
let messageId: string;
let messageAuthorId: string;
let adminToken: string;

async function createUser(label: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') {
  const user = await prisma.user.create({
    data: {
      name: `${label} ${suffix}`,
      email: `comunidade-${label}-${suffix}@cromocard.dev`,
      role,
    },
  });
  userIds.push(user.id);
  return user.id;
}

async function createReport(groupMessageId = messageId): Promise<string> {
  const report = await prisma.report.create({
    data: { reporterId, targetType: 'GROUP_MESSAGE', groupMessageId, reason: 'Spam' },
  });
  return report.id;
}

async function queuedReportIds(): Promise<string[]> {
  const res = await asAdmin('get', '/reports').query({ pageSize: 100 });
  return dataOf<{ id: string }[]>(res).map(({ id }) => id);
}

function asAdmin(method: Method, path: string) {
  const url = `/api/v1/admin/community${path}`;
  return request(createApp())[method](url).set('Authorization', `Bearer ${adminToken}`);
}

const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorOf = (res: request.Response) => (res.body as ErrorBody).error;

function auditOf(action: string, entityId: string) {
  return prisma.auditLog.findFirst({ where: { adminId, action, entityId } });
}

async function listedGroups(query: Record<string, string>) {
  return dataOf<GroupBody[]>(await asAdmin('get', '/groups').query({ q: suffix, ...query }));
}

beforeAll(async () => {
  adminId = await createUser('admin', 'ADMIN');
  adminToken = signAccessToken({ id: adminId, role: 'ADMIN' });
  const [creatorId, memberId, leftId] = await Promise.all(
    ['criador', 'membro', 'saiu'].map((label) => createUser(label)),
  );
  reporterId = creatorId!;
  const group = await prisma.group.create({
    data: { name: `Copa ${suffix}`, accessType: 'OPEN', creatorId: reporterId },
  });
  const suspended = await prisma.group.create({
    data: {
      name: `Pokémon ${suffix}`,
      accessType: 'CLOSED',
      creatorId: reporterId,
      status: 'SUSPENDED',
    },
  });
  const warnable = await prisma.group.create({
    data: { name: `Advertido ${suffix}`, accessType: 'OPEN', creatorId: reporterId },
  });
  [groupId, suspendedGroupId, warnableGroupId] = [group.id, suspended.id, warnable.id];
  await prisma.groupMember.createMany({
    data: [
      { groupId, userId: reporterId, role: 'ADMIN' },
      { groupId, userId: memberId! },
      { groupId, userId: leftId!, deletedAt: new Date() },
    ],
  });
  const message = await prisma.groupMessage.create({
    data: { groupId, authorId: memberId!, content: 'Vendo figurinha falsa' },
  });
  messageId = message.id;
  messageAuthorId = memberId!;
});

afterAll(async () => {
  const allGroupIds = [groupId, suspendedGroupId, warnableGroupId];
  const groups = { groupId: { in: allGroupIds } };
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.userWarning.deleteMany({ where: { adminId } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  const chatReports = { targetUserId: { in: userIds } };
  await prisma.reportEvidence.deleteMany({ where: { report: chatReports } });
  await prisma.report.deleteMany({ where: { OR: [{ groupMessage: groups }, chatReports] } });
  await prisma.groupMessage.deleteMany({ where: groups });
  await prisma.groupMember.deleteMany({ where: groups });
  await prisma.group.deleteMany({ where: { id: { in: allGroupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds = [];
});

describe('administração de grupos (PostgreSQL real)', () => {
  it('lista os grupos no contrato, com o criador e só os membros ativos, e filtra por status', async () => {
    const res = await asAdmin('get', '/groups').query({ q: `copa ${suffix}` });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: groupId,
          name: `Copa ${suffix}`,
          accessType: 'OPEN',
          status: 'ACTIVE',
          membersCount: 2,
          creatorName: `criador ${suffix}`,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const suspended = await listedGroups({ status: 'SUSPENDED' });
    expect(suspended.map(({ id }) => id)).toEqual([suspendedGroupId]);
  });

  it('mostra o detalhe do grupo e responde 404 para grupo inexistente', async () => {
    const res = await asAdmin('get', `/groups/${groupId}`);
    const missing = await asAdmin('get', `/groups/${UNKNOWN_ID}`);

    expect(dataOf<object>(res)).toMatchObject({ id: groupId, description: null, membersCount: 2 });
    expect(missing.status).toBe(404);
    expect(errorOf(missing)).toBe('GROUP_NOT_FOUND');
  });

  it('CA2: suspende o grupo com motivo, a lista mostra o status e o log registra', async () => {
    const res = await asAdmin('post', `/groups/${groupId}/suspend`).send(REASON);
    const again = await asAdmin('post', `/groups/${groupId}/suspend`).send(REASON);

    expect(res.status).toBe(200);
    expect(dataOf<GroupBody>(res).status).toBe('SUSPENDED');
    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe('GROUP_ALREADY_SUSPENDED');
    const listed = await listedGroups({ status: 'SUSPENDED' });
    expect(listed.map(({ id }) => id)).toContain(groupId);
    const audit = await auditOf('GROUP_SUSPENDED', groupId);
    expect(audit).toMatchObject({ entityType: 'group', details: REASON });
  });

  it('CA3: reativa o grupo suspenso e recusa reativar de novo', async () => {
    const res = await asAdmin('post', `/groups/${groupId}/reactivate`).send(REASON);
    const again = await asAdmin('post', `/groups/${groupId}/reactivate`).send(REASON);

    expect(dataOf<GroupBody>(res).status).toBe('ACTIVE');
    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe('GROUP_NOT_SUSPENDED');
    await expect(auditOf('GROUP_REACTIVATED', groupId)).resolves.not.toBeNull();
  });

  it('CA8: adverte o grupo ativo, recusa advertir de novo, e aceita suspender e reativar a partir de advertido', async () => {
    const warn = await asAdmin('post', `/groups/${warnableGroupId}/warn`).send(REASON);
    const warnAgain = await asAdmin('post', `/groups/${warnableGroupId}/warn`).send(REASON);

    expect(dataOf<GroupBody>(warn).status).toBe('WARNED');
    expect(warnAgain.status).toBe(409);
    expect(errorOf(warnAgain)).toBe('GROUP_ALREADY_WARNED');
    await expect(auditOf('GROUP_WARNED', warnableGroupId)).resolves.not.toBeNull();

    const suspend = await asAdmin('post', `/groups/${warnableGroupId}/suspend`).send(REASON);
    expect(dataOf<GroupBody>(suspend).status).toBe('SUSPENDED');

    const reactivate = await asAdmin('post', `/groups/${warnableGroupId}/reactivate`).send(REASON);
    expect(dataOf<GroupBody>(reactivate).status).toBe('ACTIVE');
  });
});

describe('fila de denúncias de mensagens (PostgreSQL real)', () => {
  it('conta a denúncia nova nos indicadores', async () => {
    const before = dataOf<{ pendingReports: number }>(await asAdmin('get', '/groups/summary'));
    await createReport();

    const res = await asAdmin('get', '/groups/summary');

    expect(dataOf<{ pendingReports: number }>(res).pendingReports).toBe(before.pendingReports + 1);
  });

  it('CA5: lista a denúncia com o autor, o grupo, o texto, o motivo e quem denunciou', async () => {
    const reportId = await createReport();

    const res = await asAdmin('get', '/reports').query({ pageSize: 100 });

    const reports = dataOf<{ id: string }[]>(res);
    expect(reports.find(({ id }) => id === reportId)).toEqual({
      id: reportId,
      reason: 'Spam',
      description: null,
      origin: 'GROUP',
      reporterName: `criador ${suffix}`,
      reporterUsername: null,
      reportedUser: null,
      evidences: [],
      message: {
        id: messageId,
        content: 'Vendo figurinha falsa',
        createdAt: expect.any(String) as string,
        authorId: messageAuthorId,
        authorName: `membro ${suffix}`,
        groupName: `Copa ${suffix}`,
        authorAccountAgeDays: 0,
        authorWarnings: 0,
        reportersCount: expect.any(Number) as number,
      },
    });
  });

  it('R13/R14: filtra por gravidade e mostra idade da conta, advertências e quantos denunciaram', async () => {
    const member = await createUser('autor-critico');
    const message = await prisma.groupMessage.create({
      data: {
        groupId: warnableGroupId,
        authorId: member,
        content: 'Clique aqui e ganhe boosters grátis',
      },
    });
    await prisma.report.create({
      data: {
        reporterId,
        targetType: 'GROUP_MESSAGE',
        groupMessageId: message.id,
        reason: 'Spam/Golpe',
      },
    });
    const secondReporter = await createUser('segundo-denunciante');
    await prisma.report.create({
      data: {
        reporterId: secondReporter,
        targetType: 'GROUP_MESSAGE',
        groupMessageId: message.id,
        reason: 'Spam/Golpe',
      },
    });
    const critical = dataOf<{ id: string; message: { reportersCount: number } }[]>(
      await asAdmin('get', '/reports').query({ severity: 'CRITICAL', pageSize: 100 }),
    );
    const spam = dataOf<{ id: string }[]>(
      await asAdmin('get', '/reports').query({ severity: 'SPAM', pageSize: 100 }),
    );
    const ofMessage = critical.filter((report) => report.message.reportersCount >= 2);

    expect(critical.length).toBeGreaterThan(0);
    expect(spam.length).toBeGreaterThan(0);
    expect(ofMessage.length).toBeGreaterThan(0);
    expect(ofMessage[0]?.message.reportersCount).toBe(2);
  });

  it('CA7: dispensa a denúncia e a mensagem continua', async () => {
    const reportId = await createReport();

    const res = await asAdmin('post', `/reports/${reportId}/dismiss`).send(REASON);
    const again = await asAdmin('post', `/reports/${reportId}/dismiss`).send(REASON);

    expect(dataOf<object>(res)).toEqual({ id: reportId, status: 'DISMISSED' });
    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe('REPORT_ALREADY_RESOLVED');
    const message = await prisma.groupMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.deletedAt).toBeNull();
    await expect(auditOf('REPORT_DISMISSED', reportId)).resolves.not.toBeNull();
  });

  it('CA6: remove a mensagem, resolve a denúncia com o moderador e registra o log', async () => {
    const otherReportId = await createReport();
    const reportId = await createReport();

    const res = await asAdmin('post', `/reports/${reportId}/remove-message`).send(REASON);

    expect(dataOf<object>(res)).toEqual({ id: reportId, status: 'RESOLVED' });
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(report).toMatchObject({ status: 'RESOLVED', moderatorId: adminId });
    expect(report.resolvedAt).toBeInstanceOf(Date);
    const message = await prisma.groupMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.deletedAt).toBeInstanceOf(Date);
    const other = await prisma.report.findUniqueOrThrow({ where: { id: otherReportId } });
    expect(other).toMatchObject({ status: 'RESOLVED', moderatorId: adminId });
    const audit = await auditOf('GROUP_MESSAGE_REMOVED', messageId);
    expect(audit).toMatchObject({
      entityType: 'group_message',
      details: {
        ...REASON,
        reportId,
        before: { status: 'PENDING' },
        after: { status: 'RESOLVED' },
      },
    });
    expect((audit?.details as { resolvedReportIds: string[] }).resolvedReportIds).toContain(
      otherReportId,
    );
  });

  it('CA5/R8: remove a mensagem, adverte o autor, notifica e resolve a denúncia', async () => {
    const author = await createUser('autor-advertido');
    const message = await prisma.groupMessage.create({
      data: { groupId, authorId: author, content: 'Ofensa a outro membro' },
    });
    const reportId = await createReport(message.id);

    const res = await asAdmin('post', `/reports/${reportId}/remove-and-warn`).send(REASON);

    expect(dataOf<object>(res)).toEqual({ id: reportId, status: 'RESOLVED' });
    const removedMessage = await prisma.groupMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(removedMessage.deletedAt).toBeInstanceOf(Date);

    const warning = await prisma.userWarning.findFirstOrThrow({ where: { userId: author } });
    expect(warning.reason).toBe(REASON.reason);
    expect(warning.reportId).toBe(reportId);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: author, type: 'USER_WARNED' },
    });
    expect(notification.message).toBe(REASON.reason);

    await expect(auditOf('GROUP_MESSAGE_REMOVED', message.id)).resolves.not.toBeNull();
    await expect(auditOf('USER_WARNED', author)).resolves.not.toBeNull();
  });

  it('R7: se a advertência falhar, a mensagem não é removida, a denúncia fica aberta e nada é registrado', async () => {
    const message = await prisma.groupMessage.create({
      data: { groupId, authorId: adminId, content: 'Mensagem do próprio admin' },
    });
    const reportId = await createReport(message.id);

    const res = await asAdmin('post', `/reports/${reportId}/remove-and-warn`).send(REASON);

    expect(res.status).toBe(422);
    const storedMessage = await prisma.groupMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(storedMessage.deletedAt).toBeNull();
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(report.status).toBe('PENDING');
    await expect(auditOf('GROUP_MESSAGE_REMOVED', message.id)).resolves.toBeNull();

    await prisma.report.delete({ where: { id: reportId } });
    await prisma.groupMessage.delete({ where: { id: message.id } });
  });

  it('R3: justificativa acima de 255 caracteres responde 400 sem remover a mensagem', async () => {
    const author = await createUser('autor-justificativa-longa');
    const message = await prisma.groupMessage.create({
      data: { groupId, authorId: author, content: 'Mensagem denunciada' },
    });
    const reportId = await createReport(message.id);

    const res = await asAdmin('post', `/reports/${reportId}/remove-and-warn`).send({
      reason: 'a'.repeat(256),
    });

    expect(res.status).toBe(400);
    const storedMessage = await prisma.groupMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(storedMessage.deletedAt).toBeNull();

    await prisma.report.delete({ where: { id: reportId } });
    await prisma.groupMessage.delete({ where: { id: message.id } });
  });

  it('R13: o histórico de resolvidas mostra a denúncia mesmo com a mensagem já removida', async () => {
    const author = await createUser('autor-historico');
    const message = await prisma.groupMessage.create({
      data: { groupId, authorId: author, content: 'Mensagem que vai para o histórico' },
    });
    const reportId = await createReport(message.id);
    await asAdmin('post', `/reports/${reportId}/remove-message`).send(REASON);

    const res = await asAdmin('get', '/reports').query({ status: 'RESOLVED', pageSize: 100 });

    expect(dataOf<{ id: string }[]>(res).map(({ id }) => id)).toContain(reportId);
  });

  it('responde 404 para denúncia inexistente', async () => {
    const res = await asAdmin('post', `/reports/${UNKNOWN_ID}/dismiss`).send(REASON);

    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe('REPORT_NOT_FOUND');
  });
});

describe('acesso à administração da comunidade (PostgreSQL real)', () => {
  it('CA8: responde 403 para token de CUSTOMER', async () => {
    const customerToken = signAccessToken({ id: reporterId, role: 'CUSTOMER' });

    const res = await request(createApp())
      .get('/api/v1/admin/community/groups')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('exclusão de grupo (PostgreSQL real)', () => {
  it('tira da fila e dos pendentes as denúncias das mensagens do grupo excluído, e dispensar responde 404', async () => {
    const message = await prisma.groupMessage.create({
      data: { groupId, authorId: reporterId, content: 'Mais uma mensagem denunciada' },
    });
    const reportId = await createReport(message.id);
    expect(await queuedReportIds()).toContain(reportId);
    const before = dataOf<{ pendingReports: number }>(await asAdmin('get', '/groups/summary'));

    await prisma.group.update({ where: { id: groupId }, data: { deletedAt: new Date() } });
    const after = dataOf<{ pendingReports: number }>(await asAdmin('get', '/groups/summary'));
    const queuedAfter = await queuedReportIds();
    const blocked = await asAdmin('post', `/reports/${reportId}/dismiss`).send(REASON);
    await prisma.group.update({ where: { id: groupId }, data: { deletedAt: null } });

    expect(queuedAfter).not.toContain(reportId);
    expect(after.pendingReports).toBe(before.pendingReports - 1);
    expect(blocked.status).toBe(404);
    expect(errorOf(blocked)).toBe('REPORT_NOT_FOUND');
  });

  it('CA4: exclui o grupo com motivo, ele some da lista e o log registra', async () => {
    const res = await asAdmin('delete', `/groups/${groupId}`).send(REASON);

    expect(res.status).toBe(204);
    const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.deletedAt).toBeInstanceOf(Date);
    const listed = await listedGroups({});
    expect(listed.map(({ id }) => id).sort()).toEqual([suspendedGroupId, warnableGroupId].sort());
    expect((await asAdmin('get', `/groups/${groupId}`)).status).toBe(404);
    await expect(auditOf('GROUP_DELETED', groupId)).resolves.not.toBeNull();
  });
});

describe('denúncias do chat pessoal na fila (CCD047, PostgreSQL real)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const privateStorage = createStorageProvider('private');
  const PRINT_KEY = `report-evidences/${crypto.randomUUID()}.png`;

  beforeAll(async () => {
    await privateStorage.upload({ key: PRINT_KEY, content: PNG, contentType: 'image/png' });
  });

  afterAll(async () => {
    await privateStorage.delete(PRINT_KEY);
  });

  async function createChatReport(reason = 'Assédio', withPrint = true) {
    const targetId = await createUser(`contato${crypto.randomUUID().slice(0, 4)}`);
    const report = await prisma.report.create({
      data: {
        reporterId,
        targetUserId: targetId,
        targetType: 'USER',
        reason,
        description: 'Mensagens ofensivas no chat',
        ...(withPrint && { evidences: { create: [{ url: PRINT_KEY }] } }),
      },
    });
    return { reportId: report.id, targetId };
  }

  it('CA18: mostra o card do chat com o contato, o motivo, a descrição e o print, nos indicadores', async () => {
    const before = dataOf<{ pendingReports: number }>(await asAdmin('get', '/groups/summary'));
    const { reportId, targetId } = await createChatReport();

    const res = await asAdmin('get', '/reports').query({ pageSize: 100 });
    const summary = dataOf<{ pendingReports: number }>(await asAdmin('get', '/groups/summary'));

    expect(dataOf<{ id: string }[]>(res).find(({ id }) => id === reportId)).toMatchObject({
      origin: 'CHAT',
      reason: 'Assédio',
      description: 'Mensagens ofensivas no chat',
      reporterName: `criador ${suffix}`,
      message: null,
      reportedUser: { id: targetId, accountAgeDays: 0, warnings: 0 },
      evidences: [{ id: expect.any(String) as string }],
    });
    expect(summary.pendingReports).toBe(before.pendingReports + 1);
  });

  it('R19: Golpe e Assédio entram em Críticos, e Spam em Spam', async () => {
    const harassment = await createChatReport('Assédio');
    const spam = await createChatReport('Spam');

    const critical = await asAdmin('get', '/reports').query({
      pageSize: 100,
      severity: 'CRITICAL',
    });
    const spamOnly = await asAdmin('get', '/reports').query({ pageSize: 100, severity: 'SPAM' });

    const idsOf = (res: request.Response) => dataOf<{ id: string }[]>(res).map(({ id }) => id);
    expect(idsOf(critical)).toContain(harassment.reportId);
    expect(idsOf(critical)).not.toContain(spam.reportId);
    expect(idsOf(spamOnly)).toContain(spam.reportId);
    expect(idsOf(spamOnly)).not.toContain(harassment.reportId);
  });

  it('a denúncia de usuário sem print (de outra tela) não entra na fila', async () => {
    const { reportId } = await createChatReport('Comportamento abusivo', false);

    expect(await queuedReportIds()).not.toContain(reportId);
  });

  it('CA18: dispensa a denúncia do chat com o moderador e a data', async () => {
    const { reportId } = await createChatReport();

    const res = await asAdmin('post', `/reports/${reportId}/dismiss`).send(REASON);

    expect(res.status).toBe(200);
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    expect(report).toMatchObject({ status: 'DISMISSED', moderatorId: adminId });
    expect(report?.resolvedAt).toBeInstanceOf(Date);
    expect(await queuedReportIds()).not.toContain(reportId);
  });

  it.each(['warn', 'suspend', 'block'])(
    'CA18: a sanção %s ao autor pela fila resolve a denúncia',
    async (sanction) => {
      const { reportId, targetId } = await createChatReport();
      const body = { reason: 'Golpe confirmado no chat', reportId, days: 7 };

      const res = await request(createApp())
        .post(`/api/v1/users/${targetId}/${sanction}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sanction === 'suspend' ? body : { reason: body.reason, reportId });

      expect(res.status).toBeLessThan(300);
      const report = await prisma.report.findUnique({ where: { id: reportId } });
      expect(report).toMatchObject({ status: 'RESOLVED', moderatorId: adminId });
    },
  );

  async function evidenceIdOf(reportId: string): Promise<string> {
    const evidence = await prisma.reportEvidence.findFirstOrThrow({ where: { reportId } });
    return evidence.id;
  }

  it('L13: o print sai só pela rota do admin, lido do storage privado, sem a chave na fila', async () => {
    const { reportId } = await createChatReport();
    const evidenceId = await evidenceIdOf(reportId);

    const queue = await asAdmin('get', '/reports').query({ pageSize: 100 });
    const res = await asAdmin('get', `/reports/${reportId}/evidences/${evidenceId}`);

    expect(JSON.stringify(dataOf(queue))).not.toContain(PRINT_KEY);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(res.body as Buffer)).toEqual(PNG);
  });

  it('L13: sem login responde 401, e quem não é ADMIN recebe 403', async () => {
    const { reportId } = await createChatReport();
    const path = `/api/v1/admin/community/reports/${reportId}/evidences/${await evidenceIdOf(reportId)}`;
    const customerToken = signAccessToken({ id: reporterId, role: 'CUSTOMER' });

    expect((await request(createApp()).get(path)).status).toBe(401);
    const asCustomer = await request(createApp())
      .get(path)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(asCustomer.status).toBe(403);
  });

  it('responde 404 EVIDENCE_NOT_FOUND para o print de outra denúncia', async () => {
    const first = await createChatReport();
    const other = await createChatReport();

    const res = await asAdmin(
      'get',
      `/reports/${other.reportId}/evidences/${await evidenceIdOf(first.reportId)}`,
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'EVIDENCE_NOT_FOUND' });
  });

  async function sanction(targetId: string, reportId: string) {
    return request(createApp())
      .post(`/api/v1/users/${targetId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Golpe confirmado no chat', reportId });
  }

  it('a sanção com uma denúncia que não existe responde 404 e não bane', async () => {
    const { targetId } = await createChatReport();

    const res = await sanction(targetId, UNKNOWN_ID);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'REPORT_NOT_FOUND' });
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    expect(target?.status).toBe('ACTIVE');
  });

  it('CA18: duas advertências ao mesmo tempo pela mesma denúncia viram uma só, e a outra responde 409', async () => {
    const { reportId, targetId } = await createChatReport();
    const warn = () =>
      request(createApp())
        .post(`/api/v1/users/${targetId}/warn`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Golpe confirmado no chat', reportId });

    const statuses = (await Promise.all([warn(), warn()])).map((res) => res.status).sort();

    expect(statuses[0]).toBeLessThan(300);
    expect(statuses[1]).toBe(409);
    await expect(prisma.userWarning.count({ where: { userId: targetId, reportId } })).resolves.toBe(
      1,
    );
  });

  it('a sanção com uma denúncia já dispensada responde 409 e não bane', async () => {
    const { reportId, targetId } = await createChatReport();
    await asAdmin('post', `/reports/${reportId}/dismiss`).send(REASON);

    const res = await sanction(targetId, reportId);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'REPORT_ALREADY_RESOLVED' });
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    expect(target?.status).toBe('ACTIVE');
  });
});
