import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from '@/lib/zod';

const DATA_DIR = path.join(import.meta.dirname, 'data');

export function loadSeedData<T extends z.ZodType>(fileName: string, schema: T): z.infer<T> {
  const content: unknown = JSON.parse(readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
  const result = schema.safeParse(content);

  if (!result.success) {
    throw new Error(`Seed: dados inválidos em data/${fileName}\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const daysAgo = (days: number) => new Date(Date.now() - days * DAY_IN_MS);

export const seedKey = z.string().regex(/^[a-z0-9][a-z0-9-]*$/i);
