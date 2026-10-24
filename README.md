# Backend CromoCard

API do CromoCard em Node.js 24 + TypeScript + Express 5 + Prisma 7 (PostgreSQL 18).

Chegou agora na equipe? Comece pelo [guia da equipe](docs/ONBOARDING.md): acessos, fluxo de trabalho, homologação, release e rollback.

## Rodando localmente

```bash
cp .env.example .env          # valores fictícios; gere o JWT_SECRET com: openssl rand -hex 32
docker compose up -d          # PostgreSQL 18 local (docker-compose.yml da raiz)
npm ci                        # o postinstall roda "prisma generate"
npm run db:migrate            # aplica as migrations de database/migrations
npm run db:seed               # dados de teste; login admin@cromocard.dev / CromoCard@2026
npm run dev                   # API em http://localhost:3000 (docs em /docs)
PORT=3001 npm run dev:ws      # esqueleto do serviço de tempo real
```

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/config` | Variáveis de ambiente validadas (`env.ts`), logger e Swagger |
| `src/domains` | Um módulo por domínio (`users` é o modelo para os demais) |
| `src/shared` | Erros, middlewares, health check, tipos e utilitários |
| `src/lib` | Prisma, JWT e Zod |
| `database` | `schema.prisma`, migrations e seeds |
| `infra` | Compose de homologação e produção (deploy no servidor) |
| `tests/unit`, `tests/integration` | Testes fora dos domínios; os testes de domínio ficam ao lado do código (`*.spec.ts`) |

## Variáveis de ambiente

Os nomes seguem o contrato da infraestrutura: os mesmos do `.env.example`, do `infra/docker-compose.yml` e dos Environments do GitHub.

| Nome | Obrigatória | Observação |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Em homologação e produção, montada pelo Compose |
| `JWT_SECRET` | Sim | Mínimo de 32 caracteres |
| `CORS_ORIGIN` | Sim | Lista separada por vírgula |
| `PORT` | Não | Padrão 3000 (API); o serviço ws usa 3001 |
| `NODE_ENV` | Não | `development`, `test` ou `production` |
| `LOG_LEVEL` | Não | Padrão `info` |

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint e checagem de tipos |
| `npm run format` / `npm run format:check` | Prettier |
| `npm test` | Testes unitários (sem banco) |
| `npm run test:integration` | Testes de integração; precisam de um PostgreSQL 18 com as migrations aplicadas no `DATABASE_URL` |
| `npm run build` | Gera `dist/server.js` e `dist/ws-server.js` com o tsup |
| `npm run db:migrate` / `npm run db:deploy` | Cria e aplica migrations (dev) / aplica as existentes |
| `npm run db:seed` | Popula o banco com dados de teste, um arquivo por domínio em `database/seeds/`; pode rodar de novo sem duplicar (não roda em produção) |

## Health check

`GET /health` responde `{"status":"ok"}` e é usado pelo healthcheck dos containers e pelo deploy. `GET /health/db` confere o banco.

## Docker

Um único `Dockerfile` multi-stage gera as duas imagens usadas em `infra/docker-compose.yml`:

```bash
docker build --target api -t cromocard-api .   # API (porta 3000); também roda o serviço migrate
docker build --target ws  -t cromocard-ws .    # tempo real (porta 3001), por enquanto só /health
```

As imagens rodam como o usuário `node` (não-root).

## CI

O workflow `.github/workflows/ci.yml` roda em todo push e pull request: lint, typecheck, `prisma validate`, testes unitários, testes de integração com PostgreSQL 18, scan de segredos (gitleaks), build das imagens, scan com Trivy e push para `ghcr.io/codaqui/cromocard-api:<sha>` e `ghcr.io/codaqui/cromocard-ws:<sha>` (o `BACKEND_TAG` do compose).

## Segredos

Nenhum valor real vai para o repositório: só o `.env.example`, com valores fictícios.
Onde cada segredo fica e como trocar: [docs/runbooks/segredos.md](docs/runbooks/segredos.md).
