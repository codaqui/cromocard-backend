import { z } from '@/lib/zod';

export const DEADLINE_HOURS_OPTIONS = [24, 48, 72, 168] as const;

export type DeadlineHours = (typeof DEADLINE_HOURS_OPTIONS)[number];

export const PENDING_NOTICE_MESSAGE_MAX_LENGTH = 500;

export const sendPendingNoticeSchema = z.object({
  templateKey: z.string().trim().min(1).max(60).optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Escreva a mensagem da pendência')
    .max(
      PENDING_NOTICE_MESSAGE_MAX_LENGTH,
      `A mensagem pode ter até ${PENDING_NOTICE_MESSAGE_MAX_LENGTH} caracteres`,
    ),
  deadlineHours: z.literal(DEADLINE_HOURS_OPTIONS),
});

export type SendPendingNoticeInput = z.infer<typeof sendPendingNoticeSchema>;
