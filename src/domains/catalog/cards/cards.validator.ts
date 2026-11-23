import { z } from '@/lib/zod';

export const cardIdParamSchema = z.object({ id: z.uuid() });
export const cardListingsParamSchema = z.object({ cardId: z.uuid() });
