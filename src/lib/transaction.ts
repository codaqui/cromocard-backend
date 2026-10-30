import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

export type Transaction = Prisma.TransactionClient;

export type TransactionRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;

export const runInTransaction: TransactionRunner = (work) => prisma.$transaction(work);
