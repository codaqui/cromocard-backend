import { z } from '@/lib/zod';

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

export const reasonSchema = z.string().trim().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH);

export const reasonBodySchema = z.object({ reason: reasonSchema });

export type ReasonBody = z.infer<typeof reasonBodySchema>;
