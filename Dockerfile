# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
# 前端构建不需要编译 better-sqlite3 等原生模块
RUN npm ci --ignore-scripts

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json postcss.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

RUN npm run build

FROM node:20-bookworm-slim AS production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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
