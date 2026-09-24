# Minutes: API + built web app in one small image. Multi-arch (amd64 + arm64 for Oracle Ampere).
# Build:  docker build -t minutes .
# Run:    docker run -p 3001:3001 -v minutes-data:/data --env-file .env minutes

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# better-sqlite3 ships prebuilt binaries; the toolchain is only a fallback for unusual platforms.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/

FROM base AS web
RUN npm ci -w apps/web
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM base AS server-deps
RUN npm ci --omit=dev -w apps/server

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data HOST=0.0.0.0 PORT=3001 MODEL_CACHE_DIR=/data/models
COPY --from=server-deps /app/node_modules node_modules
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY --from=web /app/apps/web/dist apps/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
