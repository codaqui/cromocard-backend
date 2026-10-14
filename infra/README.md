# infra — Docker Compose de homologação e produção

Arquivos que o pipeline de deploy copia para `/srv/cromocard/<env>/` no servidor.

| Arquivo | Conteúdo |
| --- | --- |
| `docker-compose.yml` | Base comum: `postgres`, `migrate`, `api`, `ws`, `web`, `admin`, `cloudflared`; redes `edge` e `data` (interna, sem internet); volume `pgdata` |
| `compose.hml.yml` | Limites de homologação e sidecar `ts-hml-db` (banco de homologação pela VPN) |
| `compose.prod.yml` | Limites de produção; sem sidecar |
| `compose.sem-frontend.yml` | Override temporário: sobe sem `web` e `admin` enquanto não existe imagem do frontend (usado sozinho pelo `deploy.yml` quando `FRONTEND_TAG=sem-frontend`) |
| `tailscale/serve-db.json` | Repassa a 5432 do sidecar para o `postgres` |
| `validacao.env.example` | Valores fictícios, só para validar a sintaxe |

Regras: todos os serviços têm `restart: unless-stopped` e `no-new-privileges` (âncora `x-hardening`); nenhum serviço usa `ports:`.

## Tags das imagens

O backend e o frontend estão em repositórios separados, cada um publica as imagens com o SHA do próprio commit:

- `BACKEND_TAG`: `api`, `ws` e `migrate`
- `FRONTEND_TAG`: `web` e `admin`

O deploy de um repositório atualiza só a sua tag no `.env` e mantém a outra.

## Validar

```bash
cd infra
for e in hml prod; do
  docker compose -p cromocard-$e --env-file validacao.env.example \
    -f docker-compose.yml -f compose.$e.yml config -q && echo "$e OK"
done
```

Para conferir também o modo sem frontend, acrescente `-f compose.sem-frontend.yml`.

O mesmo teste roda no CI (`.github/workflows/compose-validate.yml`) em todo PR que altera `infra/`.

## Uso no servidor

```bash
docker compose -p cromocard-<env> -f docker-compose.yml -f compose.<env>.yml up -d
docker compose -p cromocard-<env> -f docker-compose.yml -f compose.<env>.yml run --rm migrate
```

## Deploy (`.github/workflows/deploy.yml`)

| Evento | Ambiente | Tag (`BACKEND_TAG`) |
| --- | --- | --- |
| Push em `develop`, depois do CI verde (job *Deploy em hml* do `ci.yml`) | `hml` | SHA desse push |
| Push em `main` (merge de release com *Create a merge commit*) | `prod`, depois da aprovação | `HEAD^2` do merge commit, o mesmo SHA testado em hml |
| *Actions → deploy → Run workflow* | escolhido | SHA informado (rollback manual) |

O job roda no runner self-hosted (`cromocard-deploy`), copia estes arquivos para `/srv/cromocard/<env>/`, gera o `.env` (permissão 600, preservando o `FRONTEND_TAG`), baixa `api` e `ws` do GHCR, roda as migrations, sobe tudo e testa o `/health`. Se o healthcheck falhar, volta sozinho para a tag de `.previous-tag` e avisa no canal (`TEAM_WEBHOOK`).

Arquivos que o deploy mantém no servidor, em `/srv/cromocard/<env>/`:

- `.deployed-tag`: SHA que está no ar (gravado só depois do healthcheck OK);
- `.previous-tag`: SHA que estava no ar antes do último deploy.

Rollback manual: veja a tag anterior (`cat /srv/cromocard/prod/.previous-tag`, ou o SHA de um deploy anterior em *Actions*), abra *Actions → deploy → Run workflow*, escolha a branch `main`, o ambiente e a tag, e aprove. Atenção: voltar a imagem não desfaz migrations; elas precisam ser compatíveis com a versão anterior.
