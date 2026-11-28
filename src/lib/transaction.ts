import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

export type Transaction = Prisma.TransactionClient;

export type TransactionRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;

type CommitCallback = () => void;

const pendingCallbacks = new WeakMap<Transaction, CommitCallback[]>();

export const runInTransaction: TransactionRunner = async (work) => {
  const callbacks: CommitCallback[] = [];
  const result = await prisma.$transaction((tx) => {
    pendingCallbacks.set(tx, callbacks);
    return work(tx);
  });
  callbacks.forEach((callback) => {
    callback();
  });
  return result;
};

export function afterCommit(tx: Transaction | undefined, callback: CommitCallback): void {
  const pending = tx && pendingCallbacks.get(tx);
  if (pending) {
    pending.push(callback);
    return;
  }
  callback();
}
