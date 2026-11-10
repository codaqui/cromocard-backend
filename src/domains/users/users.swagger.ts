import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  adminUpdateUserSchema,
  createUserSchema,
  listUsersQuerySchema,
  reasonSchema,
  updateUserSchema,
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
    summary: 'Cadastra um usuário e envia o convite por e-mail (administrador)',
    request: { body: { content: { 'application/json': { schema: createUserSchema } } } },
    responses: {
      201: { description: 'Usuário cadastrado' },
      400: { description: 'Dados inválidos' },
      403: { description: 'Apenas administradores' },
      409: { description: 'E-mail, nome de usuário ou CPF já cadastrado' },
    },
  },
  {
    method: 'get',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Retorna os dados de um usuário (administrador)',
    responses: {
      200: { description: 'Dados do usuário' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
    },
  },
  {
    method: 'patch',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Edita nome, e-mail ou papel de um usuário (administrador)',
    request: { body: { content: { 'application/json': { schema: adminUpdateUserSchema } } } },
    responses: {
      200: { description: 'Usuário atualizado' },
      400: { description: 'Dados inválidos' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
      409: { description: 'E-mail, nome de usuário ou CPF já cadastrado' },
      422: { description: 'Não pode alterar o próprio papel ou rebaixar o último administrador' },
    },
  },
  {
    method: 'post',
    path: '/users/{id}/suspend',
    tags,
    security,
    summary: 'Suspende um usuário (administrador)',
    request: { body: { content: { 'application/json': { schema: reasonSchema } } } },
    responses: {
      200: { description: 'Usuário suspenso' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
      409: { description: 'Usuário já está suspenso' },
      422: { description: 'Não pode suspender a própria conta ou o último administrador' },
    },
  },
  {
    method: 'post',
    path: '/users/{id}/reactivate',
    tags,
    security,
    summary: 'Reativa um usuário suspenso (administrador)',
    request: { body: { content: { 'application/json': { schema: reasonSchema } } } },
    responses: {
      200: { description: 'Usuário reativado' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
      409: { description: 'Usuário não está suspenso' },
    },
  },
  {
    method: 'post',
    path: '/users/{id}/resend-activation',
    tags,
    security,
    summary: 'Reenvia o link de ativação por e-mail (administrador)',
    responses: {
      202: { description: 'Link reenviado' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
      409: { description: 'Usuário já definiu a senha' },
    },
  },
  {
    method: 'delete',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Exclui um usuário (administrador, soft delete)',
    request: { body: { content: { 'application/json': { schema: reasonSchema } } } },
    responses: {
      204: { description: 'Usuário excluído' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Usuário não encontrado' },
      422: { description: 'Não pode excluir a própria conta ou o último administrador' },
    },
  },
];

export function registerUsersDocs(registry: OpenAPIRegistry): void {
  usersPaths.forEach((path) => registry.registerPath(path));
}
