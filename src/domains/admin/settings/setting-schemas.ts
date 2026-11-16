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

export const imageUrlSchema = z.url({ protocol: /^https?$/ }).max(URL_MAX_LENGTH);

export const homeBannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(200),
  ctaText: z.string().trim().min(1).max(30),
  ctaUrl: httpsUrl,
  imageUrl: imageUrlSchema.nullable(),
});

const templateSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(500),
});

type TemplateInput = z.infer<typeof templateSchema>;

const DUPLICATED_NAME = 'Já existe um template com este nome';
const DUPLICATED_ID = 'O template aparece mais de uma vez';

function repeatedIndexes(values: (string | undefined)[]): number[] {
  const seen = new Set<string>();
  return values.flatMap((value, index) => {
    if (value === undefined) return [];
    const repeated = seen.has(value);
    seen.add(value);
    return repeated ? [index] : [];
  });
}

function addRepeatedTemplateIssues(templates: TemplateInput[], ctx: z.RefinementCtx): void {
  const names = templates.map(({ name }) => name.toLocaleLowerCase('pt-BR'));
  repeatedIndexes(names).forEach((index) =>
    ctx.addIssue({ code: 'custom', path: [index, 'name'], message: DUPLICATED_NAME }),
  );
  repeatedIndexes(templates.map(({ id }) => id)).forEach((index) =>
    ctx.addIssue({ code: 'custom', path: [index, 'id'], message: DUPLICATED_ID }),
  );
}

export const notificationTemplatesSchema = z
  .array(templateSchema)
  .max(TEMPLATES_MAX)
  .superRefine(addRepeatedTemplateIssues);

export type NotificationTemplate = Required<TemplateInput>;

const goalSchema = z.number().int().min(1).max(GOAL_MAX);

export const monthlySignupGoalSchema = goalSchema.nullable();

export const votingGoalSchema = goalSchema;

export const defaultBacksSchema = z.record(z.uuid(), imageUrlSchema);

export type DefaultBacks = z.infer<typeof defaultBacksSchema>;

export const EDITABLE_SETTING_KEYS = [
  SETTING_KEYS.homeBanner,
  SETTING_KEYS.notificationTemplates,
] as const;

export const PUBLIC_SETTING_KEYS = [SETTING_KEYS.homeBanner] as const;

export function isEditableSettingKey(key: string): boolean {
  return EDITABLE_SETTING_KEYS.some((editable) => editable === key);
}

export function isPublicSettingKey(key: string): boolean {
  return PUBLIC_SETTING_KEYS.some((publicKey) => publicKey === key);
}
