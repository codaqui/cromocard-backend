# Domínio uploads — Envio de imagens

Sprint 06 (16/10 a 30/10) · User Stories: #336 (CCD061) · Backlog completo em `Azure-Devops/backlog-sprint-06.md` (repositório do workspace).

Os arquivos já existem com as assinaturas prontas. Enquanto uma task não é feita, a rota responde `501 Funcionalidade em construção`
e os testes que faltam aparecem como `todo` no `npm test`. ⚠️ = desbloqueia os colegas: abra o PR primeiro.

| Task | O que fazer | Dono | Estimativa | Arquivos |
|---|---|---|---|---|
| [#400](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/400) ⚠️ | Upload de imagens (LocalStorageProvider + POST /uploads) | Lucas | 4h | `src/providers/storage/local-storage.provider.ts`<br>`src/domains/uploads/uploads.service.ts`<br>`src/domains/uploads/uploads.controller.ts`<br>`src/domains/uploads/uploads.routes.ts`<br>`src/app.ts` |

## Como pegar uma task

1. Abra a task no Azure: a descrição tem o passo a passo, o critério de pronto e como testar.
2. `git switch develop`, `git pull` e crie a branch indicada na task.
3. Implemente nos arquivos da tabela; rode `npm run lint`, `npm run typecheck` e `npm test`.
4. Abra o PR para `develop` com `AB#<número da task>` e aponte as horas no mesmo dia (Jibble e Azure).
