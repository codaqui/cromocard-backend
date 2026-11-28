import { describe, expect, it } from 'vitest';

import { afterCommit, runInTransaction } from '@/lib/transaction';

describe('afterCommit', () => {
  it('roda o que foi registrado dentro da transação só depois do commit', async () => {
    const steps: string[] = [];

    await runInTransaction(async (tx) => {
      afterCommit(tx, () => steps.push('depois do commit'));
      steps.push('dentro da transação');
      return Promise.resolve();
    });

    expect(steps).toEqual(['dentro da transação', 'depois do commit']);
  });

  it('não roda nada quando a transação falha', async () => {
    const steps: string[] = [];

    await expect(
      runInTransaction(async (tx) => {
        afterCommit(tx, () => steps.push('depois do commit'));
        return Promise.reject(new Error('falha na transação'));
      }),
    ).rejects.toThrow('falha na transação');

    expect(steps).toEqual([]);
  });

  it('fora de transação, roda na hora', () => {
    const steps: string[] = [];

    afterCommit(undefined, () => steps.push('agora'));

    expect(steps).toEqual(['agora']);
  });
});
