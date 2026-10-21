import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  createUserByAdminSchema,
  listUsersQuerySchema,
  updateUserByAdminSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './users.validator';

const tags = ['Usuários'];
const security = [{ bearerAuth: [] }];

const usersPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/users',
    tags,
    security,
    summary: 'Lista os usuários (administrador)',
    request: { query: listUsersQuerySchema },
    responses: {
      200: { description: 'Lista paginada de usuários' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'get',
    path: '/users/me',
    tags,
    security,
    summary: 'Retorna os dados do usuário logado',
    responses: { 200: { description: 'Dados do usuário' } },
  },
  {
    method: 'patch',
    path: '/users/me',
    tags,
    security,
    summary: 'Atualiza os dados do usuário logado',
    request: { body: { content: { 'application/json': { schema: updateUserSchema } } } },
    responses: {
      200: { description: 'Usuário atualizado' },
      400: { description: 'Dados inválidos' },
    },
  },
  {
    method: 'delete',
    path: '/users/me',
    tags,
    security,
    summary: 'Exclui a conta do usuário logado (soft delete)',
    responses: { 204: { description: 'Conta excluída' } },
  },
  {
    method: 'post',
    path: '/users',
    tags,
    security,
    summary: 'Cadastra um usuário e envia o link para definir a senha (CCD059)',
    request: { body: { content: { 'application/json': { schema: createUserByAdminSchema } } } },
    responses: {
      201: { description: 'Usuário criado' },
      409: { description: 'E-mail ou nome de usuário já usado' },
    },
  },
  {
    method: 'get',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Detalhes de um usuário (administrador)',
    request: { params: userIdParamsSchema },
    responses: { 200: { description: 'Usuário' }, 404: { description: 'Não encontrado' } },
  },
  {
    method: 'patch',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Edita os dados e o papel de um usuário (CCD059)',
    request: {
      params: userIdParamsSchema,
      body: { content: { 'application/json': { schema: updateUserByAdminSchema } } },
    },
    responses: {
      200: { description: 'Usuário atualizado' },
      422: { description: 'Rebaixar a própria conta ou o último administrador' },
    },
  },
  {
    method: 'delete',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Exclui um usuário (soft delete, pode ser restaurado)',
    request: { params: userIdParamsSchema },
    responses: { 204: { description: 'Usuário excluído' } },
  },
  {
    method: 'post',
    path: '/users/{id}/suspend',
    tags,
    security,
    summary: 'Suspende um usuário (CCD059, RN04)',
    request: { params: userIdParamsSchema },
    responses: { 200: { description: 'Usuário suspenso' } },
  },
  {
    method: 'post',
    path: '/users/{id}/reactivate',
    tags,
    security,
    summary: 'Reativa um usuário suspenso (CCD059, RN04)',
    request: { params: userIdParamsSchema },
    responses: { 200: { description: 'Usuário reativado' } },
  },
  {
    method: 'post',
    path: '/users/{id}/restore',
    tags,
    security,
    summary: 'Restaura um usuário excluído (CCD059, RN03)',
    request: { params: userIdParamsSchema },
    responses: { 200: { description: 'Usuário restaurado' } },
  },
];

export function registerUsersDocs(registry: OpenAPIRegistry): void {
  usersPaths.forEach((path) => registry.registerPath(path));
}
