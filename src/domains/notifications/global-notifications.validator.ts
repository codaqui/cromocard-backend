import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const NOTIFICATION_AUDIENCES = ['ALL', 'ACTIVE_COLLECTORS', 'SELLERS'] as const;
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;

export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const TITLE_MAX_LENGTH = 120;
export const CONTENT_MAX_LENGTH = 500;
export const LINK_MAX_LENGTH = 255;
/** O agendamento precisa estar pelo menos 5 minutos à frente (CCD100, L2). */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

/** Caminho do site ("/albuns/…") ou endereço http(s) (CCD060, L12). */
const LINK_PATTERN = /^(\/(?!\/)\S*|https?:\/\/\S+)$/;

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const requiredText = (max: number, emptyMessage: string) =>
  z.string(emptyMessage).trim().min(1, emptyMessage).max(max, `Use até ${max} caracteres.`);

const isFarEnoughAhead = (date: Date) => date.getTime() - Date.now() >= MIN_SCHEDULE_LEAD_MS;

export const dispatchGlobalNotificationSchema = z.object({
  title: requiredText(TITLE_MAX_LENGTH, 'Informe o título.'),
  content: requiredText(CONTENT_MAX_LENGTH, 'Informe a mensagem.'),
  link: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(LINK_MAX_LENGTH, `Use até ${LINK_MAX_LENGTH} caracteres.`)
      .regex(LINK_PATTERN, 'Informe um caminho que comece com / ou um link http(s).')
      .optional(),
  ),
  audience: z.enum(NOTIFICATION_AUDIENCES).default('ALL'),
  channels: z
    .array(z.enum(NOTIFICATION_CHANNELS))
    .min(1, 'Escolha pelo menos um canal.')
    .default(['IN_APP'])
    .transform((channels) => [...new Set(channels)]),
  scheduledAt: z.coerce
    .date('Informe a data e o horário do envio.')
    .refine(isFarEnoughAhead, 'Escolha um horário com pelo menos 5 minutos de antecedência.')
    .optional(),
});

export const listGlobalNotificationsQuerySchema = paginationQuerySchema;

export const globalNotificationIdParamSchema = z.object({ id: z.uuid() });

export type DispatchGlobalNotificationInput = z.infer<typeof dispatchGlobalNotificationSchema>;
export type ListGlobalNotificationsQuery = z.infer<typeof listGlobalNotificationsQuerySchema>;
