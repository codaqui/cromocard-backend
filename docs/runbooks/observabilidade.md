# Runbook — Logs e monitoramento (projeto `cromocard-ops`)

Como instalar, configurar e operar o Dozzle (logs) e o Uptime Kuma (status e alertas). Os dois ficam acessíveis só pela VPN, no nó `cromocard-ops` do Tailscale. O arquivo é o [`infra/compose.ops.yml`](../../infra/compose.ops.yml); o guia da equipe é o [`docs/ONBOARDING.md`](../ONBOARDING.md).

| Ferramenta | Endereço | Quem usa | Login |
| --- | --- | --- | --- |
| Dozzle | `http://cromocard-ops:8080` | Grupo `dev` (só logs de homologação) | Nenhum: a VPN é o controle de acesso |
| Uptime Kuma, página de status | `http://cromocard-ops:3001/status/cromocard` | Grupo `dev` | Nenhum |
| Uptime Kuma, painel | `http://cromocard-ops:3001` | Lucas e Duarte | Conta única, senha no Bitwarden (*CromoCard — Uptime Kuma*) |

Logs de produção não aparecem no Dozzle: podem ter dados pessoais (LGPD). Lucas e Duarte veem com `docker logs` no servidor.

## Pré-requisitos

1. `/srv/cromocard/ops/.env` (dono `deploy`, permissão `600`) com `TS_AUTHKEY_OPS` (chave `tag:ops`, etapa 4.3) e `TAILSCALE_VERSION` (a mesma de homologação, hoje `v1.102.5`). A chave só vale no primeiro registro e expira em até 90 dias depois de gerada: se já expirou, gere outra em *Tailscale → Settings → Keys* (*Pre-approved* ligado; *Reusable* e *Ephemeral* desligados).
2. Política do Tailscale (*Access controls*) permitindo:
   - `group:dev` e `group:infra` → `tag:ops:8080,3001`;
   - o nó do servidor (`homeserver`) → `tag:ops:3001`, para o backup avisar o monitor *Push*.
3. Secret do canal da equipe (`TEAM_WEBHOOK`): a mesma URL de webhook do Discord ou do Slack que o `deploy.yml` usa.

## Instalar ou atualizar

No servidor, pelo SSH no Tailscale:

```bash
sudo -iu deploy
cd /srv/cromocard/ops
curl -fsSLo compose.ops.yml https://raw.githubusercontent.com/codaqui/cromocard-backend/develop/infra/compose.ops.yml
docker compose --env-file .env -f compose.ops.yml config -q && echo OK
docker compose --env-file .env -f compose.ops.yml up -d
docker compose -p cromocard-ops ps            # os quatro serviços "running"; o uptime-kuma fica "healthy"
```

Em *Tailscale → Machines* aparece `cromocard-ops` com `tag:ops`. Desligue o *Key expiry* dessa máquina, como no `cromocard-hml-db`.

Para atualizar uma versão, troque a tag no repositório (PR para a `develop`), baixe o arquivo de novo e rode o mesmo `up -d`. Para desfazer, volte o arquivo anterior e rode `up -d` de novo.

**Nunca** rode `down -v`: apaga a identidade do nó no Tailscale e todos os monitores. Para parar, use `docker compose -p cromocard-ops down` (sem `-v`).

## Primeiro acesso ao Uptime Kuma

Faça logo depois do `up -d`: a primeira pessoa que abrir o painel cria a conta de administrador.

1. Abra `http://cromocard-ops:3001`. Escolha **SQLite** como banco.
2. Crie a conta (usuário `cromocard-admin`, senha gerada pelo Bitwarden) e guarde no item *CromoCard — Uptime Kuma*.
3. Em *Settings → General*, fuso horário `America/Sao_Paulo`.

## Alerta no canal da equipe

1. *Settings → Notifications → Setup Notification*.
2. Tipo **Discord** ou **Slack**, conforme o canal; cole a URL do `TEAM_WEBHOOK`.
3. Marque **Default enabled** e **Apply on all existing monitors**.
4. Clique em **Test**: a mensagem precisa chegar ao canal.

## Monitores

Crie com *Add New Monitor*. Em todos: *Retries* `2` (evita alerta por uma falha isolada) e a notificação do canal ligada.

| Monitor | Tipo | Alvo | Intervalo |
| --- | --- | --- | --- |
| API prod | HTTP(s) | `https://api.cromocard.com.br/health` | 60 s |
| WS prod | HTTP(s) | `https://ws.cromocard.com.br/health` | 120 s |
| Web prod | HTTP(s) | `https://cromocard.com.br` | 60 s |
| Admin prod | HTTP(s) | `https://admin.cromocard.com.br` | 120 s |
| API hml | HTTP(s) | `https://hml-api.cromocard.com.br/health` | 120 s |
| WS hml | HTTP(s) | `https://hml-ws.cromocard.com.br/health` | 120 s |
| Backup diário | Push | URL gerada pelo Kuma (abaixo) | 90000 s (25 h) |

O serviço `ws` responde `/health` na própria porta, por isso o monitor usa esse caminho com status 200, e não uma conexão WebSocket.

**Monitores que vão ficar vermelhos no começo:** os de produção, até o primeiro release; `Web prod` e `Admin prod`, até o frontend publicar as imagens. Crie e use **Pause** neles, para não acostumar o canal a alertas falsos. Tire a pausa quando o serviço existir.

**Página de status:** *Status Pages → New Status Page*, nome `CromoCard`, slug `cromocard`. Adicione os monitores, separados em *Produção*, *Homologação* e *Rotinas*. É ela que a equipe consulta, sem login.

## Monitor do backup (T8)

1. Ao criar o monitor *Push*, o Kuma mostra uma URL como `http://cromocard-ops:3001/api/push/<token>?status=up&msg=OK&ping=`.
2. Passe a URL ao Lucas, por mensagem direta (o token permite marcar o backup como feito). Ele grava no serviço do backup:

   ```bash
   sudo systemctl edit cromocard-backup.service
   # [Service]
   # Environment=KUMA_PUSH_URL=http://cromocard-ops:3001/api/push/<token>?status=up&msg=OK&ping=
   ```

3. Do servidor, `curl -fsS "$KUMA_PUSH_URL"` precisa responder `{"ok":true}`. Se o nome `cromocard-ops` não resolver, use o IP de `tailscale ip -4 cromocard-ops`.

## Conferir que está pronto

- [ ] De uma máquina do grupo `dev` (sem acesso ao servidor), `http://cromocard-ops:8080` abre e lista só containers `cromocard-hml-*`.
- [ ] Da mesma máquina, `http://cromocard-ops:3001/status/cromocard` mostra os monitores.
- [ ] O **Test** da notificação chegou ao canal.
- [ ] Depois de uma execução manual do backup, o monitor *Backup diário* fica verde.
- [ ] `ss -tlnp` no servidor não mostra 8080 nem 3001 (nenhuma porta publicada).

## Limitações conhecidas

- **Se o servidor cair, o Kuma cai junto e não avisa.** Falta um monitor fora do servidor para `https://api.cromocard.com.br/health` (etapa 7.2 do Plano de Execução; por exemplo, uma segunda instância no Controlador, 192.168.18.201).
- O Dozzle não tem login: qualquer pessoa do grupo `dev` vê os logs de homologação. Por isso o filtro (`DOZZLE_FILTER`) não pode ser removido, e homologação nunca tem dado real.
- O Dozzle não recebe o `docker.sock`. Ele fala com um proxy que só libera leitura de containers, eventos e informações do sistema; ações e shell ficam desligados.
- Os monitores ficam no volume `cromocard-ops_kuma-data`. Vale incluir esse volume no backup da T8.
