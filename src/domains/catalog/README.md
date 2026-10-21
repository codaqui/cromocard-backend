# Domínio catalog — Catálogo global

Sprint 06 (16/10 a 30/10) · User Stories: #336 (CCD061), #341 (CCD066) · Backlog completo em `Azure-Devops/backlog-sprint-06.md` (repositório do workspace).

Os arquivos já existem com as assinaturas prontas. Enquanto uma task não é feita, a rota responde `501 Funcionalidade em construção`
e os testes que faltam aparecem como `todo` no `npm test`. ⚠️ = desbloqueia os colegas: abra o PR primeiro.

| Task | O que fazer | Dono | Estimativa | Arquivos |
|---|---|---|---|---|
| [#401](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/401) | Raridades e idiomas (dados de apoio) | Lucas | 1h | `src/domains/catalog/reference-data/reference-data.repository.ts`<br>`src/domains/catalog/reference-data/reference-data.service.ts` |
| [#402](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/402) | Álbuns: repository e service | Lucas | 3h | `src/domains/catalog/albums/albums.repository.ts`<br>`src/domains/catalog/albums/albums.service.ts` |
| [#403](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/403) | Cartas: repository e service | Lucas | 4h | `src/domains/catalog/cards/cards.repository.ts`<br>`src/domains/catalog/cards/cards.service.ts` |
| [#404](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/404) | Testes do catálogo e do upload | Lucas | 4h | `src/domains/catalog/albums/albums.service.spec.ts`<br>`src/domains/catalog/cards/cards.service.spec.ts`<br>`src/domains/catalog/reference-data/reference-data.service.spec.ts`<br>`src/domains/uploads/uploads.service.spec.ts` |
| [#408](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/408) | JSON de raridades e idiomas | Felipe Broetto | 2h | `database/seeds/data/rarities.json` (novo)<br>`database/seeds/data/languages.json` (novo) |
| [#409](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/409) | JSON do catálogo de exemplo | Felipe Broetto | 3h | `database/seeds/data/catalog.json` (novo) |
| [#410](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/410) ⚠️ | Categorias: repository e service | Gabriel | 4h | `src/domains/catalog/categories/categories.repository.ts`<br>`src/domains/catalog/categories/categories.service.ts` |
| [#412](https://dev.azure.com/CromoCard/CromoCard/_workitems/edit/412) | Testes de categorias e banner | Gabriel | 3h | `src/domains/catalog/categories/categories.service.spec.ts`<br>`src/domains/admin/settings/settings.service.spec.ts` |

## Como pegar uma task

1. Abra a task no Azure: a descrição tem o passo a passo, o critério de pronto e como testar.
2. `git switch develop`, `git pull` e crie a branch indicada na task.
3. Implemente nos arquivos da tabela; rode `npm run lint`, `npm run typecheck` e `npm test`.
4. Abra o PR para `develop` com `AB#<número da task>` e aponte as horas no mesmo dia (Jibble e Azure).
