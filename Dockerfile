ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /app

ENV CI=true
ENV VITE_DOCKER_BUILD=1
ENV SKIP_API_SERVER=1
# 小内存 VPS 建议至少 2GB；不足时可临时加 swap
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY package.json package-lock.json ./
# 前端构建不需要编译 better-sqlite3 等原生模块
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm ci --ignore-scripts --no-audit --no-fund --registry=${NPM_REGISTRY}

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json postcss.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

# 构建在 1 核小机器上常需 3–10 分钟，日志较少时并非卡死
RUN echo ">>> Starting vite build for low-memory Docker host..." \
  && npm run build -- --logLevel info \
  && echo ">>> Frontend build completed"

FROM ${NODE_IMAGE} AS production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm ci --omit=dev --no-audit --no-fund --registry=${NPM_REGISTRY}

COPY server ./server
COPY scripts ./scripts
COPY --from=frontend-build /app/dist ./dist

ENV NODE_ENV=production
ENV AI_SERVER_HOST=0.0.0.0
ENV AI_SERVER_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
