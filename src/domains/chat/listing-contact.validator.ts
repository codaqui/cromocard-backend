import { z } from '@/lib/zod';

export const listingIdParamSchema = z.object({ id: z.uuid({ error: 'Identificador inválido.' }) });
