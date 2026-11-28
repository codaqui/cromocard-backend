import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import {
  contactsQuerySchema,
  conversationIdParamSchema,
  listConversationsQuerySchema,
  messagesQuerySchema,
  startConversationSchema,
} from './chat.validator';

const tags = ['Chat pessoal'];
const security = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const count = z.number().int().min(0);

const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores usam o chat pessoal' },
};
const notFound = {
  404: { description: 'CONVERSATION_NOT_FOUND: conversa inexistente ou de outras pessoas' },
};

const contact = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  avatarUrl: z
    .string()
    .nullable()
    .openapi({ description: 'Foto do perfil; nulo quando a pessoa não tem foto' }),
  verified: z.boolean().openapi({ description: 'Vendedor com a verificação aprovada' }),
});

const conversation = z.object({
  id: z.uuid(),
  contact,
  lastMessage: z
    .object({ content: z.string(), fromMe: z.boolean(), createdAt: z.iso.datetime() })
    .nullable(),
  unreadCount: count,
  createdAt: z.iso.datetime(),
});

const message = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  author: z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() }),
  content: z.string(),
  isRead: z.boolean(),
  createdAt: z.iso.datetime(),
});

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/me/conversations',
    tags,
    security,
    summary: 'Conversas do usuário, da última mensagem mais recente para a mais antiga (CCD046)',
    request: { query: listConversationsQuerySchema },
    responses: {
      200: {
        description: '`total` respeita a busca e a aba; `totals` não (selo, abas e rodapé)',
        ...json(
          z.object({
            data: z.array(conversation),
            meta: z.object({
              page: count,
              pageSize: count,
              total: count,
              totalPages: count,
              totals: z.object({ all: count, unread: count }),
            }),
          }),
        ),
      },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
    },
  },
  {
    method: 'post',
    path: '/me/conversations',
    tags,
    security,
    summary:
      'Abre a conversa pessoal com alguém, criando-a se ainda não existir (Nova conversa, CCD046)',
    request: { body: json(startConversationSchema) },
    responses: {
      201: { description: 'Conversa criada', ...json(z.object({ data: conversation })) },
      200: { description: 'Conversa que já existia', ...json(z.object({ data: conversation })) },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
      404: {
        description:
          'USER_NOT_FOUND: inexistente, inativo, administrador, bloqueado ou o próprio usuário',
      },
    },
  },
  {
    method: 'get',
    path: '/me/conversations/{id}/messages',
    tags,
    security,
    summary: 'Mensagens da conversa, 30 por vez, da mais antiga para a mais nova (CCD046)',
    request: { params: conversationIdParamSchema, query: messagesQuerySchema },
    responses: {
      200: {
        description: '`nextCursor` traz as anteriores',
        ...json(
          z.object({ data: z.array(message), meta: z.object({ nextCursor: z.uuid().nullable() }) }),
        ),
      },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
      ...notFound,
    },
  },
  {
    method: 'post',
    path: '/me/conversations/{id}/read',
    tags,
    security,
    summary: 'Marca como lidas as mensagens recebidas na conversa (CCD046, L13)',
    request: { params: conversationIdParamSchema },
    responses: { 204: { description: 'Marcadas' }, ...accessErrors, ...notFound },
  },
  {
    method: 'get',
    path: '/me/contacts',
    tags,
    security,
    summary: 'Contatos para a Nova conversa, até 10, sem bloqueados nem administradores (CCD046)',
    request: { query: contactsQuerySchema },
    responses: {
      200: {
        description: 'Contatos por nome',
        ...json(
          z.object({
            data: z.array(contact.extend({ role: z.string(), commonGroups: z.array(z.string()) })),
          }),
        ),
      },
      400: { description: 'VALIDATION_ERROR' },
      ...accessErrors,
    },
  },
];

export function registerChatDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
