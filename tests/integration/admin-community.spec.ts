import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

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
let messageId: string;
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
  [groupId, suspendedGroupId] = [group.id, suspended.id];
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
});

afterAll(async () => {
  const groups = { groupId: { in: [groupId, suspendedGroupId] } };
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.report.deleteMany({ where: { groupMessage: groups } });
  await prisma.groupMessage.deleteMany({ where: groups });
  await prisma.groupMember.deleteMany({ where: groups });
  await prisma.group.deleteMany({ where: { id: { in: [groupId, suspendedGroupId] } } });
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
      reporterName: `criador ${suffix}`,
      message: {
        id: messageId,
        content: 'Vendo figurinha falsa',
        createdAt: expect.any(String) as string,
        authorName: `membro ${suffix}`,
        groupName: `Copa ${suffix}`,
      },
    });
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
  it('tira da fila e dos pendentes as denúncias das mensagens do grupo excluído', async () => {
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
    expect(blocked.status).toBe(409);
  });

  it('CA4: exclui o grupo com motivo, ele some da lista e o log registra', async () => {
    const res = await asAdmin('delete', `/groups/${groupId}`).send(REASON);

    expect(res.status).toBe(204);
    const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.deletedAt).toBeInstanceOf(Date);
    const listed = await listedGroups({});
    expect(listed.map(({ id }) => id)).toEqual([suspendedGroupId]);
    expect((await asAdmin('get', `/groups/${groupId}`)).status).toBe(404);
    await expect(auditOf('GROUP_DELETED', groupId)).resolves.not.toBeNull();
  });
});
