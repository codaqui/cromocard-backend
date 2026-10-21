# Domínio admin — Auditoria, Dashboard e Configurações

Sprint 06 (16/10 a 30/10) · User Stories: #333 (CCD058), #340 (CCD065), #341 (CCD066) · Backlog completo em `Azure-Devops/backlog-sprint-06.md` (repositório do workspace).

Os arquivos já existem com as assinaturas prontas. Enquanto uma task não é feita, a rota responde `501 Funcionalidade em construção`
e os testes que faltam aparecem como `todo` no `npm test`. ⚠️ = desbloqueia os colegas: abra o PR primeiro.

| Task | O que fazer | Dono | Estimativa | Arquivos |
|---|---|---|---|---|
| [#411](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/411) | Banner da Home: repository e service | Gabriel | 3h | `src/domains/admin/settings/settings.repository.ts`<br>`src/domains/admin/settings/settings.service.ts` |
| [#412](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/412) | Testes de categorias e banner | Gabriel | 3h | `src/domains/catalog/categories/categories.service.spec.ts`<br>`src/domains/admin/settings/settings.service.spec.ts` |
| [#416](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/416) ⚠️ | AuditLogsService: record, list e detalhe | Lucca | 3h | `src/domains/admin/audit-logs/audit-logs.repository.ts`<br>`src/domains/admin/audit-logs/audit-logs.service.ts`<br>`README.md (seção de auditoria)` |
| [#417](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/417) | Testes da AuditLogsService | Lucca | 2h | `src/domains/admin/audit-logs/audit-logs.service.spec.ts` |
| [#419](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/419) | DashboardService: indicadores por período | Lucca | 2h | `src/domains/admin/dashboard/dashboard.repository.ts`<br>`src/domains/admin/dashboard/dashboard.service.ts` |
| [#420](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/420) | Testes da DashboardService | Lucca | 2h | `src/domains/admin/dashboard/dashboard.service.spec.ts` |

## Como pegar uma task

1. Abra a task no Azure: a descrição tem o passo a passo, o critério de pronto e como testar.
2. `git switch develop`, `git pull` e crie a branch indicada na task.
3. Implemente nos arquivos da tabela; rode `npm run lint`, `npm run typecheck` e `npm test`.
4. Abra o PR para `develop` com `AB#<número da task>` e aponte as horas no mesmo dia (Jibble e Azure).
