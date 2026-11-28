import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { z } from '@/lib/zod';

import { seedChat } from './chat.seed';
import { loadSeedData } from './load-seed-data';

const seedFile = loadSeedData(
  'conversations.json',
  z.object({
    conversations: z.array(z.object({ messages: z.array(z.unknown()) })),
    blocks: z.array(z.unknown()),
  }),
);

type Row = Record<string, unknown>;

interface UpsertArgs {
  where: Row;
  create: Row;
  update: Row;
}

function memoryDatabase() {
  const tables = new Map<string, Map<string, Row>>();
  const tableOf = (name: string) => {
    const table = tables.get(name) ?? new Map<string, Row>();
    tables.set(name, table);
    return {
      upsert: ({ where, create, update }: UpsertArgs) => {
        const key = JSON.stringify(where);
        const current = table.get(key);
        table.set(key, current ? { ...current, ...update } : { ...create });
        return Promise.resolve();
      },
    };
  };
  const prisma = {
    conversation: tableOf('conversation'),
    conversationParticipant: tableOf('conversationParticipant'),
    message: tableOf('message'),
    userBlock: tableOf('userBlock'),
  } as unknown as PrismaClient;
  const rowsOf = (name: string) => [...(tables.get(name)?.values() ?? [])];
  const sizes = () => Object.fromEntries([...tables].map(([name, table]) => [name, table.size]));
  return { prisma, rowsOf, sizes };
}

const messageCount = seedFile.conversations.reduce(
  (total, { messages }) => total + messages.length,
  0,
);

describe('seedChat', () => {
  it('grava as conversas, os dois participantes de cada uma, as mensagens e os bloqueios', async () => {
    const { prisma, sizes } = memoryDatabase();

    await seedChat(prisma);

    expect(sizes()).toEqual({
      conversation: seedFile.conversations.length,
      conversationParticipant: seedFile.conversations.length * 2,
      message: messageCount,
      userBlock: seedFile.blocks.length,
    });
  });

  it('é idempotente: rodar de novo não cria linha nova', async () => {
    const { prisma, sizes } = memoryDatabase();

    await seedChat(prisma);
    const first = sizes();
    await seedChat(prisma);

    expect(sizes()).toEqual(first);
  });

  it('cada mensagem é de um participante da conversa dela', async () => {
    const { prisma, rowsOf } = memoryDatabase();

    await seedChat(prisma);

    const members = new Set(
      rowsOf('conversationParticipant').map(
        (row) => `${String(row.conversationId)}:${String(row.userId)}`,
      ),
    );
    const authors = rowsOf('message').map(
      (row) => `${String(row.conversationId)}:${String(row.authorId)}`,
    );
    expect(authors.every((author) => members.has(author))).toBe(true);
  });

  it('a mensagem não lida fica sem data de leitura, e a lida tem a data', async () => {
    const { prisma, rowsOf } = memoryDatabase();

    await seedChat(prisma);

    const messages = rowsOf('message');
    expect(messages.some((row) => row.isRead === false)).toBe(true);
    expect(messages.every((row) => (row.isRead ? row.readAt !== null : row.readAt === null))).toBe(
      true,
    );
  });
});
