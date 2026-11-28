import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import { seedMarketplace } from './marketplace.seed';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

type Row = { id: string } & Record<string, unknown>;

interface UpsertArgs {
  where: { id: string };
  create: Row;
  update: Row;
}

interface RetireArgs {
  where: { id: { in: string[] }; deletedAt: null };
  data: { deletedAt: Date };
}

const LEGACY_STUDIO_ID = seedId(SeedNamespace.legacyProfileAddresses, 'ana-studio-campinas');

function memoryDatabase() {
  const tables = new Map<string, Map<string, Row>>();
  const tableOf = (name: string) => {
    const table = tables.get(name) ?? new Map<string, Row>();
    tables.set(name, table);
    return table;
  };
  const upsertInto = (name: string) => ({
    upsert: ({ where, create, update }: UpsertArgs) => {
      const table = tableOf(name);
      table.set(where.id, { ...(table.get(where.id) ? update : create) });
      return Promise.resolve();
    },
  });
  const retire = ({ where, data }: RetireArgs) => {
    const rows = [...tableOf('address').values()].filter(
      (row) => where.id.in.includes(row.id) && row.deletedAt === null,
    );
    rows.forEach((row) => Object.assign(row, data));
    return Promise.resolve({ count: rows.length });
  };
  const names = ['listing', 'order', 'payment', 'priceHistory', 'groupMessage'];
  const prisma = {
    address: { ...upsertInto('address'), updateMany: retire },
    ...Object.fromEntries(names.map((name) => [name, upsertInto(name)])),
  } as unknown as PrismaClient;
  return { prisma, tableOf };
}

const anaAddresses = (rows: Map<string, Row>) =>
  [...rows.values()].filter(({ userId }) => userId === userIdOf('ana'));

describe('seedMarketplace', () => {
  it('dá à Ana o "Casa" principal e o "Studio Campinas" secundário, com complemento', async () => {
    const { prisma, tableOf } = memoryDatabase();

    await seedMarketplace(prisma);

    expect(anaAddresses(tableOf('address'))).toEqual([
      expect.objectContaining({ label: 'Casa', isPrimary: true, city: 'São Paulo' }),
      expect.objectContaining({
        label: 'Studio Campinas',
        isPrimary: false,
        complement: 'Sala 12',
      }),
    ]);
  });

  it('marca como excluído o "Studio Campinas" antigo, gravado com o id do seed do perfil', async () => {
    const { prisma, tableOf } = memoryDatabase();
    tableOf('address').set(LEGACY_STUDIO_ID, { id: LEGACY_STUDIO_ID, deletedAt: null });

    await seedMarketplace(prisma);

    expect(tableOf('address').get(LEGACY_STUDIO_ID)?.deletedAt).toBeInstanceOf(Date);
  });

  it('grava anúncios, pedidos com pagamento, histórico de preço e anúncios compartilhados', async () => {
    const { prisma, tableOf } = memoryDatabase();

    await seedMarketplace(prisma);

    const orders = [...tableOf('order').values()];
    const payments = [...tableOf('payment').values()];
    expect(tableOf('listing').size).toBeGreaterThan(0);
    expect(payments.map(({ orderId }) => orderId)).toEqual(orders.map(({ id }) => id));
    expect(payments.map(({ value }) => String(value))).toEqual(
      orders.map(({ totalAmount }) => String(totalAmount)),
    );
    expect(tableOf('priceHistory').size).toBeGreaterThan(0);
    expect(tableOf('groupMessage').size).toBeGreaterThan(0);
  });

  it('é idempotente: rodar de novo não cria linha nova', async () => {
    const { prisma, tableOf } = memoryDatabase();
    const sizes = () => ['address', 'listing', 'order'].map((name) => tableOf(name).size);

    await seedMarketplace(prisma);
    const first = sizes();
    await seedMarketplace(prisma);

    expect(sizes()).toEqual(first);
  });
});
