# Domínio users — Gestão de Usuários

Sprint 06 (16/10 a 30/10) · User Stories: #334 (CCD059) · Backlog completo em `Azure-Devops/backlog-sprint-06.md` (repositório do workspace).

Os arquivos já existem com as assinaturas prontas. Enquanto uma task não é feita, a rota responde `501 Funcionalidade em construção`
e os testes que faltam aparecem como `todo` no `npm test`. ⚠️ = desbloqueia os colegas: abra o PR primeiro.

| Task | O que fazer | Dono | Estimativa | Arquivos |
|---|---|---|---|---|
| [#391](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/391) | Provider de e-mail (Nodemailer + Ethereal) | Felipe Consulim | 2h | `src/providers/mail/ethereal-mail.provider.ts` |
| [#392](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/392) | UsersAdminRepository e filtros da lista | Felipe Consulim | 3h | `src/domains/users/users.repository.ts` |
| [#393](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/393) | Cadastrar usuário e enviar link de definição de senha | Felipe Consulim | 4h | `src/domains/users/users.service.ts`<br>`src/config/env.ts`<br>`.env.example` |
| [#394](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/394) | Editar, suspender, reativar, excluir e restaurar usuário | Felipe Consulim | 4h | `src/domains/users/users.service.ts` |
| [#395](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/395) | Testes da gestão de usuários | Felipe Consulim | 3h | `src/domains/users/users.service.spec.ts` |

## Como pegar uma task

1. Abra a task no Azure: a descrição tem o passo a passo, o critério de pronto e como testar.
2. `git switch develop`, `git pull` e crie a branch indicada na task.
3. Implemente nos arquivos da tabela; rode `npm run lint`, `npm run typecheck` e `npm test`.
4. Abra o PR para `develop` com `AB#<número da task>` e aponte as horas no mesmo dia (Jibble e Azure).
