import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const CONTACT_REPORT_REASONS = [
  'Golpe / pagamento externo',
  'Assédio',
  'Spam',
  'Perfil falso',
] as const;
export const REPORT_DESCRIPTION_MAX_LENGTH = 500;
export const MAX_EVIDENCES = 3;

const uuid = z.uuid({ error: 'Identificador inválido.' });

export const contactSchema = z.object({ userId: uuid });

export const blockedContactParamSchema = z.object({ userId: uuid });

export const listBlocksQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const formBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

export const contactReportSchema = z.object({
  userId: uuid,
  reason: z.enum(CONTACT_REPORT_REASONS, { error: 'Escolha o motivo da denúncia.' }),
  description: z
    .string()
    .trim()
    .max(REPORT_DESCRIPTION_MAX_LENGTH, {
      error: `Conte o que aconteceu em até ${REPORT_DESCRIPTION_MAX_LENGTH} caracteres.`,
    })
    .optional()
    .transform((value) => value || undefined),
  block: formBoolean.default(false),
});

export const contactReportFormSchema = contactReportSchema.extend({
  evidences: z.array(z.string().openapi({ type: 'string', format: 'binary' })).openapi({
    description: `De 1 a ${MAX_EVIDENCES} prints da conversa: PNG, JPG ou WEBP até 4 MB cada`,
  }),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ListBlocksQuery = z.infer<typeof listBlocksQuerySchema>;
export type ContactReportInput = z.infer<typeof contactReportSchema>;
export type ContactReportReason = (typeof CONTACT_REPORT_REASONS)[number];
