# Guia da equipe — CromoCard backend

Este guia leva você do zero até publicar uma mudança em produção, sem precisar acessar o servidor. Siga na ordem. Se algo daqui não funcionar como está escrito, abra uma issue: o guia está errado, não você.

**Resumo do caminho:** branch a partir da `develop` → PR → CI verde e revisão → merge na `develop` → deploy automático em homologação → testes → PR de release para a `main` → aprovação → produção.

## 1. Pedir acesso

| O quê | Com quem | Para quê |
| --- | --- | --- |
| Acesso de escrita ao `codaqui/cromocard-backend` (e ao `cromocard-frontend`, se for o caso) | Daniel | Criar branches, abrir PRs e revisar |
| Convite do Tailscale no grupo `dev` | Lucas | Ver logs e status de homologação e conectar no banco de homologação |
| Item *CromoCard — PostgreSQL homologação* no Bitwarden | Lucas | Senha do banco de homologação |

Depois do convite, instale o Tailscale ([tailscale.com/download](https://tailscale.com/download)), entre com a conta convidada e confira que aparece *Connected*. Ninguém da equipe tem SSH no servidor nem acesso ao banco de produção, e nem precisa: todo o caminho passa pelo GitHub.

## 2. Ambiente local

Precisa de Git, Node.js 24 (há um `.nvmrc`; com o nvm, `nvm use`) e Docker com o Compose.

```bash
git clone https://github.com/codaqui/cromocard-backend.git
cd cromocard-backend
git checkout develop
cp .env.example .env          # valores fictícios; troque o JWT_SECRET por: openssl rand -hex 32
docker compose up -d          # PostgreSQL 18 local, a mesma versão do servidor
npm ci                        # o postinstall roda "prisma generate"
npm run db:migrate            # aplica as migrations
npm run db:seed               # dados de teste; login admin@cromocard.dev / CromoCard@2026
npm run dev                   # API em http://localhost:3000; documentação em http://localhost:3000/docs
```

Confira: `curl http://localhost:3000/health` responde `{"status":"ok"}`. Antes de abrir um PR, rode o que o CI vai rodar:

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration      # precisa do PostgreSQL local de pé
```

Os demais scripts estão no [README](../README.md#scripts).

## 3. Fluxo de trabalho

1. **Branch a partir da `develop`**, nunca da `main`:

   ```bash
   git checkout develop && git pull
   git checkout -b feature/cadastro-de-cartas
   ```

   Prefixos: `feature/` (funcionalidade), `fix/` (correção), `docs/`, `infra/` (Compose, workflows).

2. **Commits no padrão Conventional Commits**, em português, como no histórico do repositório:

   ```text
   feat(users): adiciona busca por e-mail
   fix(auth): corrige expiração do token
   docs: atualiza o guia da equipe
   ci: ajusta o cache do npm
   chore(deps): atualiza o prisma
   ```

   Tipos mais usados: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `chore`. O que vem entre parênteses é o domínio ou a área.

3. **Pull request para a `develop`.** Descreva o que muda e como testar. O CI roda sozinho e precisa ficar verde nos cinco checks: *Lint, prisma validate e testes unitários*, *Testes de integração (PostgreSQL)*, *Scan de segredos (gitleaks)*, *Imagem api (build, Trivy, GHCR)* e *Imagem ws (build, Trivy, GHCR)*. Se algum falhar, corrija e faça um novo push na mesma branch.

4. **Revisão.** Pelo menos uma pessoa aprova antes do merge. Quem revisa roda o código quando a mudança não for trivial.

5. **Merge.** Com o merge na `develop`, o CI roda de novo e, no fim, o job *Deploy em hml* publica a versão em homologação. Acompanhe em *Actions*.

## 4. Homologação

Tudo que entra na `develop` vai para homologação sozinho. Use para testar e para o QA validar antes do release.

| O quê | Endereço | Precisa da VPN? |
| --- | --- | --- |
| API | `https://hml-api.cromocard.com.br` (`/health` responde `{"status":"ok"}`) | Não |
| WebSocket | `wss://hml-ws.cromocard.com.br` | Não |
| Site (o admin é uma tela do site) | `https://hml.cromocard.com.br` (quando o frontend publicar a imagem) | Não |
| Logs (Dozzle) | `http://cromocard-ops:8080` | Sim |
| Status (Uptime Kuma) | `http://cromocard-ops:3001/status/cromocard` | Sim |
| Banco | `cromocard-hml-db:5432` | Sim |

**Logs:** no Dozzle, escolha o container (`cromocard-hml-api-1`, `cromocard-hml-ws-1`) e use a busca. O Dozzle mostra só homologação; logs de produção ficam restritos ao Lucas e ao Duarte. O `migrate` roda e é removido a cada deploy, então a saída dele fica no log do job em *Actions*.

**Status:** a página do Uptime Kuma mostra se cada serviço está no ar e o histórico. As quedas também chegam ao canal da equipe.

**Banco de homologação:** com o Tailscale conectado,

```bash
psql -h cromocard-hml-db -p 5432 -U cromocard_hml cromocard_hml
```

A senha está no Bitwarden. Num cliente gráfico (DBeaver, pgAdmin), use os mesmos dados. Mudanças de estrutura do banco só por migration, nunca à mão: a próxima migration do deploy pode falhar.

**Swagger:** a documentação em `/docs` fica desligada em homologação (só aparece localmente).

## 5. Release para produção

Produção recebe **a mesma imagem** que foi testada em homologação, sem build novo.

1. Com homologação validada pelo QA, abra um PR da `develop` para a `main`, com título `release: <resumo>`.
2. Espere o CI ficar verde e a aprovação do PR.
3. Faça o merge com **Create a merge commit**. Nunca *Squash* nem *Rebase*: o deploy usa o segundo pai do merge commit para achar a imagem testada. Com outro método, o deploy falha de propósito, sem mexer em produção; nesse caso, avise o Lucas ou o Duarte.
4. Em *Actions → deploy*, a execução fica em *Waiting*. Um revisor do Environment `prod` (hoje Danixzy ou justAnormlaguy) abre a execução, clica em **Review deployments** e aprova. Quem disparou o deploy (quem fez o merge) não pode aprovar.
5. O deploy baixa as imagens, roda as migrations, sobe tudo e testa o `/health`. Confira:

   ```bash
   curl -fsS https://api.cromocard.com.br/health
   ```

## 6. Rollback

### Automático

Se a migration, a subida ou o healthcheck falharem, o deploy volta sozinho para a versão que estava no ar e manda um aviso no canal da equipe. O job fica vermelho. Nesse caso, nada mais precisa ser feito em produção: veja o log da execução em *Actions*, corrija na `develop` e siga o fluxo normal.

### Manual

Use quando a versão nova subiu, passou no healthcheck, mas está com defeito.

1. **Descubra a tag da versão anterior** (SHA completo, 40 caracteres). Qualquer um destes caminhos serve:
   - Em *Actions → deploy*, abra a última execução bem-sucedida **anterior** à versão com defeito, no ambiente certo; o job *Definir ambiente e tag* mostra `Ambiente: prod · tag: <sha>`.
   - Pelo Git, para produção (cada release é um merge commit; o segundo pai é a tag):

     ```bash
     git fetch origin main
     git log origin/main --merges --first-parent -n 5 --format='%H %s'
     git rev-parse <merge commit do release anterior>^2
     ```

   - Lucas ou Duarte, no servidor: `cat /srv/cromocard/prod/.previous-tag`.
2. Em *Actions → deploy → Run workflow*, escolha:
   - **Use workflow from:** `main` para produção, `develop` para homologação;
   - **Ambiente:** `prod` ou `hml`;
   - **tag:** o SHA do passo 1.
3. Em produção, a execução espera a aprovação de um revisor do Environment `prod`, como num release.
4. Confira o `/health` do ambiente e avise o canal da equipe.
5. **Corrija a `develop`:** reverta a mudança com defeito (`git revert`, num PR para a `develop`) ou corrija. Sem isso, o próximo merge na `develop` publica o defeito de novo em homologação, e o próximo release, em produção.

**Atenção:** o rollback volta a imagem, mas **não desfaz migrations**. Por isso a regra de migrations compatíveis, abaixo, é obrigatória.

## 7. Regras

1. **Migrations compatíveis com a versão anterior.** O código antigo precisa continuar funcionando com o banco já migrado, porque é ele que volta num rollback. Na prática:
   - adicionar coluna como opcional (ou com valor padrão), nunca obrigatória sem padrão;
   - renomear ou apagar coluna e tabela em duas etapas: num release o código para de usar; no release seguinte a migration remove;
   - nunca editar uma migration que já foi para a `develop`; crie outra.
2. **Nenhum segredo no código.** Nada de senha, token ou chave em arquivo versionado, log, issue ou PR. O `.env` é ignorado pelo Git; o `.env.example` só tem valores fictícios. O GitHub bloqueia pushes com segredos conhecidos e o CI roda o gitleaks. Se um segredo vazar, siga [docs/runbooks/segredos.md](runbooks/segredos.md): primeiro trocar, depois limpar.
3. **Nenhum dado real em homologação.** Só dados fictícios, nunca cópia de produção (LGPD). Isso inclui o banco, os testes e os prints em PRs.
4. **O repositório é público.** Os logs do *Actions* são abertos: nenhum passo de workflow imprime variáveis de ambiente, o `.env` ou o resultado de `docker compose config` (só com `-q`). O `deploy.yml` nunca ganha gatilho `pull_request` ou `pull_request_target`, porque roda no servidor.

## Onde procurar mais

| Assunto | Arquivo |
| --- | --- |
| Código, scripts e variáveis da aplicação | [README.md](../README.md) |
| Compose de homologação e produção, deploy | [infra/README.md](../infra/README.md) |
| Logs e monitoramento (instalação e alertas) | [docs/runbooks/observabilidade.md](runbooks/observabilidade.md) |
| Segredos: onde ficam e como trocar | [docs/runbooks/segredos.md](runbooks/segredos.md) |
