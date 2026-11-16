import { z } from '@/lib/zod';

import {
  type EditableSettingKey,
  editableSettingSchemas,
  isEditableSettingKey,
  monthlySignupGoalSchema,
  votingGoalSchema,
} from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';

const DEFAULT_CATEGORIES_MAX = 50;
const URL_MAX_LENGTH = 500;

export const settingKeyParamSchema = z.object({ key: z.string().trim().min(1).max(90) });

export type SettingUpdate = {
  [K in EditableSettingKey]: { key: K; value: z.infer<(typeof editableSettingSchemas)[K]> };
}[EditableSettingKey];

export function parseSettingUpdate(params: unknown, body: unknown): SettingUpdate {
  const { key } = settingKeyParamSchema.parse(params);
  if (!isEditableSettingKey(key)) throw new SettingNotFoundError();
  const { value } = z.object({ value: editableSettingSchemas[key] }).parse(body);
  return { key, value } as SettingUpdate;
}

const DUPLICATED_CATEGORY = 'A categoria aparece mais de uma vez';

export const defaultCategoriesBodySchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.uuid(),
        backImageUrl: z.url().max(URL_MAX_LENGTH).nullable(),
      }),
    )
    .max(DEFAULT_CATEGORIES_MAX)
    .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, {
      message: DUPLICATED_CATEGORY,
    }),
});

export type DefaultCategoriesInput = z.infer<typeof defaultCategoriesBodySchema>;

export const goalsBodySchema = z.object({
  monthlySignupGoal: monthlySignupGoalSchema,
  votingGoal: votingGoalSchema,
});

export type GoalsInput = z.infer<typeof goalsBodySchema>;
