import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { listUsersQuerySchema, updateUserSchema } from './users.validator';

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
];

export function registerUsersDocs(registry: OpenAPIRegistry): void {
  usersPaths.forEach((path) => registry.registerPath(path));
}
