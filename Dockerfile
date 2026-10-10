# syntax=docker/dockerfile:1
#
# Um Dockerfile, duas imagens (os nomes batem com infra/docker-compose.yml):
#   docker build --target api -t ghcr.io/codaqui/cromocard-api:<sha> .
#   docker build --target ws  -t ghcr.io/codaqui/cromocard-ws:<sha>  .
# A imagem api também roda o serviço "migrate" do compose ("prisma migrate deploy"),
# por isso a CLI do Prisma fica na imagem final e node_modules/.bin está no PATH.

# ---- Estágio 1: dependências completas + build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Estágio 2: só as dependências de produção ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Sem --ignore-scripts: o postinstall do Prisma baixa o schema engine usado pelo migrate
RUN npm ci --omit=dev && npm cache clean --force
# Client Prisma gerado no estágio de build
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# ---- Estágio 3: base comum das imagens finais ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PATH=/app/node_modules/.bin:$PATH
# npm/yarn/corepack não são usados em runtime, e o npm embutido traz dependências
# com CVEs que o Trivy reprova. Removê-los também diminui a superfície de ataque.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
       /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
       /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=prod-deps --chown=node:node /app/package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
# Usuário não-root que já vem na imagem oficial do Node (uid 1000)
USER node

# ---- Imagem cromocard-ws ----
FROM runtime AS ws
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/ws-server.js"]

# ---- Imagem cromocard-api (último estágio = padrão do "docker build" sem --target) ----
FROM runtime AS api
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
