# infra — Docker Compose de homologação e produção

Arquivos que o pipeline de deploy copia para `/srv/cromocard/<env>/` no servidor.

| Arquivo | Conteúdo |
| --- | --- |
| `docker-compose.yml` | Base comum: `postgres`, `migrate`, `api`, `ws`, `web`, `admin`, `cloudflared`; redes `edge` e `data` (interna, sem internet); volume `pgdata` |
| `compose.hml.yml` | Limites de homologação e sidecar `ts-hml-db` (banco de homologação pela VPN) |
| `compose.prod.yml` | Limites de produção; sem sidecar |
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

O mesmo teste roda no CI (`.github/workflows/compose-validate.yml`) em todo PR que altera `infra/`.

## Uso no servidor

```bash
docker compose -p cromocard-<env> -f docker-compose.yml -f compose.<env>.yml up -d
docker compose -p cromocard-<env> -f docker-compose.yml -f compose.<env>.yml run --rm migrate
```
