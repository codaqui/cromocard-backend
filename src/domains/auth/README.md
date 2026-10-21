# Domínio auth — Autenticação

Sprint 06 (16/10 a 30/10) · User Stories: #109 (CCD004) · Backlog completo em `Azure-Devops/backlog-sprint-06.md` (repositório do workspace).

Os arquivos já existem com as assinaturas prontas. Enquanto uma task não é feita, a rota responde `501 Funcionalidade em construção`
e os testes que faltam aparecem como `todo` no `npm test`. ⚠️ = desbloqueia os colegas: abra o PR primeiro.

| Task | O que fazer | Dono | Estimativa | Arquivos |
|---|---|---|---|---|
| [#381](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/381) | Hash de senha com argon2 | Daniel | 2h | `src/lib/password.ts` |
| [#382](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/382) | AuthRepository com Prisma | Daniel | 3h | `src/domains/auth/auth.repository.ts` |
| [#383](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/383) ⚠️ | AuthService: login, refresh com rotação e logout | Daniel | 4h | `src/domains/auth/auth.service.ts`<br>`src/domains/auth/auth.errors.ts` |
| [#384](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/384) ⚠️ | AuthController com cookie httpOnly | Daniel | 3h | `src/domains/auth/auth.controller.ts`<br>`src/app.ts`<br>`src/config/env.ts`<br>`.env.example` |
| [#385](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/385) | AuthService.setupPassword (definir senha pelo link) | Daniel | 2h | `src/domains/auth/auth.service.ts` |
| [#386](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/386) | Testes da AuthService | Daniel | 3h | `src/domains/auth/auth.service.spec.ts` |
| [#387](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/387) ⚠️ | Seed: administrador inicial e dados do catálogo | Daniel | 3h | `database/seeds/index.ts` (novo)<br>`prisma.config.ts`<br>`package.json`<br>`src/config/env.ts`<br>`.env.example` |

## Como pegar uma task

1. Abra a task no Azure: a descrição tem o passo a passo, o critério de pronto e como testar.
2. `git switch develop`, `git pull` e crie a branch indicada na task.
3. Implemente nos arquivos da tabela; rode `npm run lint`, `npm run typecheck` e `npm test`.
4. Abra o PR para `develop` com `AB#<número da task>` e aponte as horas no mesmo dia (Jibble e Azure).
