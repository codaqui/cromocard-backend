import { z } from '@/lib/zod';

export const SETTING_KEYS = {
  homeBanner: 'home.banner',
  notificationTemplates: 'notification.templates',
  monthlySignupGoal: 'dashboard.monthly_signup_goal',
  votingGoal: 'catalog.voting_goal',
  defaultBacks: 'catalog.default_backs',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export type JsonValue = z.infer<ReturnType<typeof z.json>>;

const URL_MAX_LENGTH = 500;
const GOAL_MAX = 1_000_000;
const TEMPLATES_MAX = 50;

const httpsUrl = z
  .url({ protocol: /^https$/, error: 'Informe um link válido, começando com https://' })
  .max(URL_MAX_LENGTH);

const imageUrl = z.url().max(URL_MAX_LENGTH);

export const homeBannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(200),
  ctaText: z.string().trim().min(1).max(30),
  ctaUrl: httpsUrl,
  imageUrl: imageUrl.nullable(),
});

const templateSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(500),
});

type TemplateInput = z.infer<typeof templateSchema>;

const DUPLICATED_NAME = 'Já existe um template com este nome';

function addDuplicatedNameIssues(templates: TemplateInput[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  templates.forEach(({ name }, index) => {
    const normalized = name.toLocaleLowerCase('pt-BR');
    if (seen.has(normalized))
      ctx.addIssue({ code: 'custom', path: [index, 'name'], message: DUPLICATED_NAME });
    seen.add(normalized);
  });
}

export const notificationTemplatesSchema = z
  .array(templateSchema)
  .max(TEMPLATES_MAX)
  .superRefine(addDuplicatedNameIssues);

export type NotificationTemplate = Required<TemplateInput>;

const goalSchema = z.number().int().min(1).max(GOAL_MAX);

export const monthlySignupGoalSchema = goalSchema.nullable();

export const votingGoalSchema = goalSchema;

export const defaultBacksSchema = z.record(z.uuid(), imageUrl);

export type DefaultBacks = z.infer<typeof defaultBacksSchema>;

export const editableSettingSchemas = {
  [SETTING_KEYS.homeBanner]: homeBannerSchema,
  [SETTING_KEYS.notificationTemplates]: notificationTemplatesSchema,
} as const;

export type EditableSettingKey = keyof typeof editableSettingSchemas;

export const PUBLIC_SETTING_KEYS: readonly string[] = [SETTING_KEYS.homeBanner];

export function isEditableSettingKey(key: string): key is EditableSettingKey {
  return Object.hasOwn(editableSettingSchemas, key);
}
