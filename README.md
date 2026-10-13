# BACKEND CROMOCARD

API do Cromocard em Node.js 22 + TypeScript + Express + Prisma (PostgreSQL).

## Rodando localmente

```bash
cp .env.example .env      # ajuste o DATABASE_URL
npm ci
npx prisma generate
npm run dev               # http://localhost:3000/health
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos do TypeScript |
| `npm test` | Testes unitários (`tests/unit`) |
| `npm run test:integration` | Testes de integração (`tests/integration`), precisam de um PostgreSQL no `DATABASE_URL` |
| `npm run build` | Compila para `dist/` |
| `npm run dev:ws` | Sobe o esqueleto do serviço ws (porta 3001) |

## Docker

Um único `Dockerfile` multi-stage gera as duas imagens usadas em `infra/docker-compose.yml`:

```bash
docker build --target api -t cromocard-api .   # API (porta 3000); também roda o serviço migrate
docker build --target ws  -t cromocard-ws .    # tempo real (porta 3001), por enquanto só /health
docker run -p 3000:3000 -e DATABASE_URL=... cromocard-api
```

As imagens rodam como o usuário `node` (não-root).

## CI

O workflow `.github/workflows/ci.yml` roda em todo push e pull request:
lint, typecheck, `prisma validate`, testes unitários, testes de integração com
PostgreSQL, build das imagens, scan com Trivy e push para
`ghcr.io/codaqui/cromocard-api:<sha>` e `ghcr.io/codaqui/cromocard-ws:<sha>`
(o `BACKEND_TAG` do compose).

O job `secrets` roda o gitleaks em todo o histórico; nenhuma imagem é publicada sem ele.

## Segredos

Nenhum valor real vai para o repositório: só o `.env.example`, com valores fictícios.
Onde cada segredo fica e como trocar: [docs/runbooks/segredos.md](docs/runbooks/segredos.md).
