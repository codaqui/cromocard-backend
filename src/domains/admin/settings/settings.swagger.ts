import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { homeBannerSchema, notificationTemplatesSchema, SETTING_KEYS } from './setting-schemas';
import { defaultCategoriesBodySchema, goalsBodySchema } from './settings.validator';

const tags = ['Administração - Configurações'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const settingView = z.object({
  key: z.string().openapi({ example: SETTING_KEYS.homeBanner }),
  value: z.unknown().openapi({ description: 'JSON validado pelo schema da chave (ADR-051)' }),
  description: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

const defaultCategoryView = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(['ALBUM', 'CARD']),
  backImageUrl: z.url().nullable(),
});

const settingKeyParam = z.object({
  key: z.enum([SETTING_KEYS.homeBanner, SETTING_KEYS.notificationTemplates]),
});

const settingUpdateBody = z.object({
  value: z.union([homeBannerSchema, notificationTemplatesSchema]).openapi({
    description: 'home.banner: o banner inteiro; notification.templates: a lista inteira',
  }),
});

const settingsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/settings',
    tags,
    security,
    summary: 'Configurações e valores atuais (CCD066)',
    responses: {
      200: { description: 'Configurações', ...json(z.object({ data: z.array(settingView) })) },
      ...accessErrors,
    },
  },
  {
    method: 'patch',
    path: '/admin/settings/{key}',
    tags,
    security,
    summary: 'Salva o banner da Home ou a lista de templates de notificação (CCD066)',
    request: { params: settingKeyParam, body: json(settingUpdateBody) },
    responses: {
      200: { description: 'Configuração salva', ...json(z.object({ data: settingView })) },
      400: { description: 'VALIDATION_ERROR: valor inválido para a chave' },
      ...accessErrors,
      404: { description: 'SETTING_NOT_FOUND: chave que não se edita por esta rota' },
    },
  },
  {
    method: 'get',
    path: '/admin/settings/default-categories',
    tags,
    security,
    summary: 'Categorias padrão com o verso de cada uma (CCD066)',
    responses: {
      200: {
        description: 'Categorias padrão',
        ...json(z.object({ data: z.array(defaultCategoryView) })),
      },
      ...accessErrors,
    },
  },
  {
    method: 'patch',
    path: '/admin/settings/default-categories',
    tags,
    security,
    summary: 'Troca o conjunto de categorias padrão e os versos, numa transação (CCD066)',
    request: { body: json(defaultCategoriesBodySchema) },
    responses: {
      200: {
        description: 'Categorias padrão salvas',
        ...json(z.object({ data: z.array(defaultCategoryView) })),
      },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
      404: { description: 'CATEGORY_NOT_FOUND: categoria inexistente ou excluída' },
      422: { description: 'DEFAULT_CATEGORY_NOT_ROOT: categoria com categoria pai' },
    },
  },
  {
    method: 'patch',
    path: '/admin/settings/goals',
    tags,
    security,
    summary: 'Salva a meta mensal de cadastros e a meta de votos, numa transação (CCD066)',
    request: { body: json(goalsBodySchema) },
    responses: {
      200: { description: 'Metas salvas', ...json(z.object({ data: goalsBodySchema })) },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
    },
  },
];

const publicSettingsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/settings/public/{key}',
    tags: ['Acesso Público'],
    summary: 'Banner da Home, sem login, mesmo desligado (CCD066)',
    request: { params: z.object({ key: z.enum([SETTING_KEYS.homeBanner]) }) },
    responses: {
      200: { description: 'Banner da Home', ...json(z.object({ data: homeBannerSchema })) },
      404: { description: 'SETTING_NOT_FOUND: só home.banner tem leitura pública' },
    },
  },
];

export function registerSettingsDocs(registry: OpenAPIRegistry): void {
  settingsPaths.forEach((path) => registry.registerPath(path));
}

export function registerPublicSettingsDocs(registry: OpenAPIRegistry): void {
  publicSettingsPaths.forEach((path) => registry.registerPath(path));
}
