# Runbook — Variáveis e segredos

Como os segredos do CromoCard são guardados, chegam ao servidor e são trocados. O contrato completo de nomes está no Documento de Apoio da Automação; o passo a passo da configuração, nas etapas 5.1 a 5.6 do Plano de Execução da Infraestrutura.

## Onde cada coisa fica

| O quê | Onde | Quem vê o valor |
| --- | --- | --- |
| Secrets e variáveis de `hml` e `prod` | GitHub → *Settings → Environments* deste repositório | Ninguém: o GitHub não mostra o valor depois de gravado |
| `REGISTRY` | GitHub → variável de repositório | Todos (não é segredo) |
| `.env` de cada ambiente | `/srv/cromocard/<env>/.env`, permissão `600`, dono `deploy`, gerado pelo deploy | Lucas e Duarte, via SSH pelo Tailscale |
| Senha do banco de homologação | Bitwarden, item *CromoCard — PostgreSQL homologação* | Equipe (grupo `dev`), para conectar em `cromocard-hml-db:5432` pela VPN |
| `TS_AUTHKEY_OPS` | Só em `/srv/cromocard/ops/.env` | Lucas e Duarte |

Regras:

- `prod` só faz deploy a partir da `main`, com aprovação de um revisor que não seja quem disparou o deploy.
- `hml` aceita `develop` e `main` (o `workflow_run` do deploy roda no contexto da branch padrão).
- Senhas de banco só com caracteres hexadecimais (`openssl rand -hex 24`), porque entram na URL do Prisma.
- O repositório é público: nenhum workflow imprime o `.env` nem roda `docker compose config` sem `-q`.
- `DATABASE_URL` não é cadastrado: o Compose monta a partir de `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`.

## Conferir os nomes cadastrados

```bash
REPO=codaqui/cromocard-backend
for ENV in hml prod; do
  echo "== $ENV"
  gh secret list   -R $REPO --env $ENV --json name --jq '.[].name'
  gh variable list -R $REPO --env $ENV --json name --jq '.[].name'
done
```

Ou rode o workflow `env-check` (*Actions → env-check → Run workflow*): ele confere os nomes sem imprimir valores.

## Rotação

| Segredo | Como trocar | Efeito |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | 1. Trocar **primeiro no banco**: `docker exec -it cromocard-<env>-postgres-1 psql -U <usuário> -d <banco>` e, dentro dele, `\password <usuário>`. 2. Atualizar o secret: `gh secret set POSTGRES_PASSWORD -R $REPO --env <env> --body "$(openssl rand -hex 24)"` (o mesmo valor do passo 1). 3. Refazer o deploy. Em `hml`, atualizar também o Bitwarden | O PostgreSQL só lê a variável quando cria o volume. Trocar só o secret derruba a API e o `migrate` |
| `JWT_SECRET` | `gh secret set JWT_SECRET -R $REPO --env <env> --body "$(openssl rand -hex 32)"` e refazer o deploy | Todas as sessões caem; os usuários entram de novo |
| `TUNNEL_TOKEN` | Rotacionar o token do túnel em *Cloudflare Zero Trust → Networks → Tunnels*, atualizar o secret e refazer o deploy | O ambiente fica fora do ar entre a rotação e o deploy |
| `TS_AUTHKEY` | Só vale no primeiro registro do sidecar. Gerar outra (`tag:hml-db`, sem *Reusable*, sem *Ephemeral*) apenas se o volume `cromocard-hml_ts-hml-db-state` for apagado | — |

Para o passo 1 da `POSTGRES_PASSWORD`, gere o valor antes com `openssl rand -hex 24`, guarde no Bitwarden e use o mesmo valor no banco e no secret.

## Se um segredo vazar

1. **Rotacionar primeiro**, seguindo a tabela acima. Num repositório público, um segredo que chegou ao GitHub conta como exposto, mesmo depois de apagado do histórico.
2. Avisar o canal da equipe.
3. Só depois limpar o rastro (commit, log, mensagem).

## Proteções ativas no repositório

- Secret scanning com push protection: o GitHub bloqueia o push que contém um segredo conhecido.
- Job `secrets` (gitleaks) no CI: varre todo o histórico em cada push e PR; nenhuma imagem é publicada sem ele. Falso positivo: registrar a impressão digital em `.gitleaksignore`, com justificativa no PR.
- Dependabot: alertas, PRs de correção de segurança e atualizações semanais de npm, Docker e GitHub Actions.
- Workflows com o `GITHUB_TOKEN` só leitura por padrão; aprovação obrigatória para workflows de colaboradores externos.
