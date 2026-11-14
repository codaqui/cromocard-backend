import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
}

interface ListResponse {
  data: AuditLogItem[];
  meta: { total: number; last30Days: number };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const ENTITY_TYPE = `TEST_${RUN_ID}`;

let adminId: string;
let otherAdminId: string;
let adminToken: string;
const entityId = crypto.randomUUID();

function getAsAdmin(path: string, query: Record<string, string> = {}) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${adminToken}`);
}

beforeAll(async () => {
  const [admin, otherAdmin] = await Promise.all(
    ['a', 'b'].map((key) =>
      prisma.user.create({
        data: {
          name: `Auditoria ${key}`,
          email: `audit-${RUN_ID}-${key}@cromocard.dev`,
          role: 'ADMIN',
        },
      }),
    ),
  );
  adminId = admin!.id;
  otherAdminId = otherAdmin!.id;
  adminToken = signAccessToken({ id: adminId, role: 'ADMIN' });

  await prisma.auditLog.createMany({
    data: [
      {
        adminId,
        action: 'USER_CREATED',
        entityType: ENTITY_TYPE,
        entityId,
        createdAt: new Date('2001-01-10T15:00:00Z'),
      },
      {
        adminId,
        action: 'USER_UPDATED',
        entityType: ENTITY_TYPE,
        entityId,
        createdAt: new Date('2001-01-20T15:00:00Z'),
      },
      {
        adminId: otherAdminId,
        action: 'USER_UPDATED',
        entityType: ENTITY_TYPE,
        createdAt: new Date('2001-02-05T15:00:00Z'),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: ENTITY_TYPE } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, otherAdminId] } } });
});

describe('Log de auditoria (repository real)', () => {
  it('filtra por tipo de entidade, ação, admin, entidade e período', async () => {
    const byType = await getAsAdmin('/api/v1/admin/audit-logs', { entityType: ENTITY_TYPE });
    expect((byType.body as ListResponse).meta.total).toBe(3);

    const byAction = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      action: 'USER_UPDATED',
    });
    expect((byAction.body as ListResponse).data.map((item) => item.action)).toEqual([
      'USER_UPDATED',
      'USER_UPDATED',
    ]);

    const byAdmin = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      adminId: otherAdminId,
    });
    expect((byAdmin.body as ListResponse).meta.total).toBe(1);

    const byEntity = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      entityId,
    });
    expect((byEntity.body as ListResponse).meta.total).toBe(2);

    const january = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      from: '2001-01-01',
      to: '2001-01-31',
    });
    expect((january.body as ListResponse).data.map((item) => item.action)).toEqual([
      'USER_UPDATED',
      'USER_CREATED',
    ]);

    const onlyFrom = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      from: '2001-02-01',
    });
    expect((onlyFrom.body as ListResponse).meta.total).toBe(1);
  });

  it('abre o detalhe de um registro e responde 404 para id inexistente', async () => {
    const list = await getAsAdmin('/api/v1/admin/audit-logs', {
      entityType: ENTITY_TYPE,
      adminId: otherAdminId,
    });
    const [entry] = (list.body as ListResponse).data;

    const detail = await getAsAdmin(`/api/v1/admin/audit-logs/${entry!.id}`);
    expect(detail.status).toBe(200);

    const missing = await getAsAdmin(`/api/v1/admin/audit-logs/${crypto.randomUUID()}`);
    expect(missing.status).toBe(404);
  });

  it('grava dentro da transação e desfaz junto quando ela falha', async () => {
    const failure = new Error('falha depois de gravar o log');
    await expect(
      runInTransaction(async (tx) => {
        await auditLogService.record(
          { adminId, action: 'USER_CREATED', entityType: ENTITY_TYPE, entityId: adminId },
          tx,
        );
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(
      await prisma.auditLog.count({ where: { entityType: ENTITY_TYPE, entityId: adminId } }),
    ).toBe(0);

    const created = await auditLogService.record({
      adminId,
      action: 'USER_SUSPENDED',
      entityType: ENTITY_TYPE,
      reason: 'Teste de integração do log',
    });
    expect(created.admin?.name).toBe('Auditoria a');

    const recent = await getAsAdmin('/api/v1/admin/audit-logs', { entityType: ENTITY_TYPE });
    expect((recent.body as ListResponse).meta.last30Days).toBeGreaterThanOrEqual(1);
  });
});
