import { z } from '@/lib/zod';

import {
  homeBannerSchema,
  imageUrlSchema,
  monthlySignupGoalSchema,
  notificationTemplatesSchema,
  SETTING_KEYS,
  votingGoalSchema,
} from './setting-schemas';

const DEFAULT_CATEGORIES_MAX = 50;
const SETTING_KEY_MAX_LENGTH = 90;

export const settingKeyParamSchema = z.object({
  key: z.string().trim().min(1).max(SETTING_KEY_MAX_LENGTH),
});

export const settingValueBodySchema = z.object({ value: z.json() });

export const settingUpdateSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal(SETTING_KEYS.homeBanner), value: homeBannerSchema }),
  z.object({
    key: z.literal(SETTING_KEYS.notificationTemplates),
    value: notificationTemplatesSchema,
  }),
]);

export type SettingUpdate = z.infer<typeof settingUpdateSchema>;

const DUPLICATED_CATEGORY = 'A categoria aparece mais de uma vez';
const SEVERAL_PINNED = 'Só uma categoria pode ser fixada no topo';

export const defaultCategoriesBodySchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.uuid(),
        backImageUrl: imageUrlSchema.nullable(),
        isPinned: z.boolean().default(false),
      }),
    )
    .max(DEFAULT_CATEGORIES_MAX)
    .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, {
      message: DUPLICATED_CATEGORY,
    })
    .refine((items) => items.filter(({ isPinned }) => isPinned).length <= 1, {
      message: SEVERAL_PINNED,
    }),
});

export type DefaultCategoriesInput = z.infer<typeof defaultCategoriesBodySchema>;

export const goalsBodySchema = z.object({
  monthlySignupGoal: monthlySignupGoalSchema,
  votingGoal: votingGoalSchema,
});

export type GoalsInput = z.infer<typeof goalsBodySchema>;
