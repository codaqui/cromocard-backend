import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { GroupAccessType, GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import {
  communityAdminIdParamSchema,
  listGroupMessageReportsQuerySchema,
  listGroupsQuerySchema,
  moderationReasonSchema,
} from './community-admin.validator';

const groupsTags = ['Administração - Comunidades'];
const moderationTags = ['Administração - Moderação de mensagens'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};
const validationError = { 400: { description: 'VALIDATION_ERROR: dados inválidos' } };
const groupNotFound = { 404: { description: 'GROUP_NOT_FOUND' } };
const reportErrors = {
  404: { description: 'REPORT_NOT_FOUND' },
  409: { description: 'REPORT_ALREADY_RESOLVED: a denúncia já foi resolvida ou dispensada' },
};

const count = z.number().int().min(0);
const positive = z.number().int().min(1);
const paginationMeta = z.object({
  page: positive,
  pageSize: positive,
  total: count,
  totalPages: count,
});

const groupSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  accessType: z.enum(GroupAccessType),
  status: z.enum(GroupStatus),
  membersCount: count.openapi({ description: 'Só os membros ativos' }),
  creatorName: z.string(),
});

const groupDetail = groupSummary.extend({
  description: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

const groupMessageReport = z.object({
  id: z.uuid(),
  reason: z.string(),
  description: z.string().nullable(),
  reporterName: z.string(),
  message: z
    .object({
      id: z.uuid(),
      content: z.string(),
      createdAt: z.iso.datetime(),
      authorName: z.string(),
      groupName: z.string(),
    })
    .nullable(),
});

const reportResolution = z.object({ id: z.uuid(), status: z.enum(ReportStatus) });

const communitySummary = z.object({
  activeGroups: count,
  messagesLast7Days: count,
  pendingReports: count,
});

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const dataOf = (schema: z.ZodType) => json(z.object({ data: schema }));
const pageOf = (schema: z.ZodType) =>
  json(z.object({ data: z.array(schema), meta: paginationMeta }));
const moderationRequest = {
  params: communityAdminIdParamSchema,
  body: json(moderationReasonSchema),
};

function groupAction(path: string, summary: string, conflict: string): RouteConfig {
  return {
    method: 'post',
    path,
    tags: groupsTags,
    security,
    summary,
    request: moderationRequest,
    responses: {
      200: { description: 'Grupo com o status novo', ...dataOf(groupDetail) },
      ...validationError,
      ...accessErrors,
      ...groupNotFound,
      409: { description: conflict },
    },
  };
}

function reportAction(path: string, summary: string): RouteConfig {
  return {
    method: 'post',
    path,
    tags: moderationTags,
    security,
    summary,
    request: moderationRequest,
    responses: {
      200: { description: 'Denúncia com o status novo', ...dataOf(reportResolution) },
      ...validationError,
      ...accessErrors,
      ...reportErrors,
    },
  };
}

const groupsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/groups',
    tags: groupsTags,
    security,
    summary: 'Lista os grupos, sem os excluídos, com busca e filtro de status (CCD062)',
    request: { query: listGroupsQuerySchema },
    responses: {
      200: { description: 'Lista paginada', ...pageOf(groupSummary) },
      ...validationError,
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/groups/summary',
    tags: groupsTags,
    security,
    summary: 'Indicadores da comunidade: grupos ativos, mensagens de 7 dias e denúncias pendentes',
    responses: {
      200: { description: 'Indicadores', ...dataOf(communitySummary) },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/groups/{id}',
    tags: groupsTags,
    security,
    summary: 'Detalhe de um grupo (CCD062)',
    request: { params: communityAdminIdParamSchema },
    responses: {
      200: { description: 'Grupo', ...dataOf(groupDetail) },
      ...validationError,
      ...accessErrors,
      ...groupNotFound,
    },
  },
  groupAction(
    '/admin/groups/{id}/suspend',
    'Suspende um grupo ativo, com motivo',
    'GROUP_ALREADY_SUSPENDED',
  ),
  groupAction(
    '/admin/groups/{id}/reactivate',
    'Reativa um grupo suspenso, com motivo',
    'GROUP_NOT_SUSPENDED',
  ),
  {
    method: 'delete',
    path: '/admin/groups/{id}',
    tags: groupsTags,
    security,
    summary: 'Exclui um grupo (soft delete), com motivo',
    request: moderationRequest,
    responses: {
      204: { description: 'Grupo excluído' },
      ...validationError,
      ...accessErrors,
      ...groupNotFound,
    },
  },
];

const moderationPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/reports/group-messages',
    tags: moderationTags,
    security,
    summary: 'Fila de denúncias de mensagens de grupo, das mais antigas para as mais novas',
    request: { query: listGroupMessageReportsQuerySchema },
    responses: {
      200: { description: 'Lista paginada', ...pageOf(groupMessageReport) },
      ...validationError,
      ...accessErrors,
    },
  },
  reportAction(
    '/admin/reports/{id}/remove-message',
    'Remove a mensagem denunciada e resolve a denúncia',
  ),
  reportAction('/admin/reports/{id}/dismiss', 'Dispensa a denúncia sem remover a mensagem'),
];

export function registerCommunityAdminDocs(registry: OpenAPIRegistry): void {
  [...groupsPaths, ...moderationPaths].forEach((path) => registry.registerPath(path));
}
