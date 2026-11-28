import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import {
  blockedContactParamSchema,
  contactReportFormSchema,
  contactSchema,
  listBlocksQuerySchema,
  MAX_EVIDENCES,
} from './contact-moderation.validator';

const tags = ['Chat pessoal'];
const security = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const count = z.number().int().min(0);

const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores moderam os contatos' },
};
const contactErrors = {
  400: { description: 'VALIDATION_ERROR ou CANNOT_MODERATE_SELF' },
  ...accessErrors,
  404: { description: 'CONTACT_NOT_FOUND: o usuário não tem conversa com o contato' },
};

const blockedContact = z.object({
  userId: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  blockedAt: z.iso.datetime(),
});

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/me/blocks',
    tags,
    security,
    summary: 'Contatos bloqueados pelo usuário, do bloqueio mais recente ao mais antigo (CCD047)',
    request: { query: listBlocksQuerySchema },
    responses: {
      200: {
        description: 'Bloqueados com o total',
        ...json(
          z.object({
            data: z.array(blockedContact),
            meta: z.object({ page: count, pageSize: count, total: count, totalPages: count }),
          }),
        ),
      },
      ...accessErrors,
    },
  },
  {
    method: 'post',
    path: '/me/blocks',
    tags,
    security,
    summary: 'Bloqueia um contato do chat; bloquear de novo restaura o bloqueio (CCD047)',
    request: { body: json(contactSchema) },
    responses: {
      201: {
        description: 'Contato bloqueado',
        ...json(z.object({ data: z.object({ userId: z.uuid(), blockedAt: z.iso.datetime() }) })),
      },
      ...contactErrors,
    },
  },
  {
    method: 'delete',
    path: '/me/blocks/{userId}',
    tags,
    security,
    summary: 'Desbloqueia um contato (CCD047)',
    request: { params: blockedContactParamSchema },
    responses: {
      204: { description: 'Contato desbloqueado' },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
      404: { description: 'BLOCK_NOT_FOUND: o contato não está bloqueado' },
    },
  },
  {
    method: 'post',
    path: '/me/contact-reports',
    tags,
    security,
    summary: `Denuncia um contato com de 1 a ${MAX_EVIDENCES} prints e, com block, também o bloqueia (CCD047)`,
    request: { body: { content: { 'multipart/form-data': { schema: contactReportFormSchema } } } },
    responses: {
      201: {
        description: 'Denúncia pendente, na fila de moderação',
        ...json(
          z.object({
            data: z.object({ id: z.uuid(), status: z.literal('PENDING'), blocked: z.boolean() }),
          }),
        ),
      },
      ...contactErrors,
      409: { description: 'REPORT_ALREADY_PENDING: já há denúncia pendente contra o contato' },
      413: { description: 'FILE_TOO_LARGE: print acima de 4 MB' },
    },
  },
];

export function registerContactModerationDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
