# syntax=docker/dockerfile:1.7
# apps/api/Dockerfile
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# ── Install all deps (including devDeps for build) ─────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,id=api-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ── Build ──────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
# Generate Prisma client into apps/api/generated/
RUN pnpm --filter api run db:generate
# Compile TypeScript
RUN pnpm --filter api run build

# ── Prune to production deps only ─────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY --from=builder /app .
RUN pnpm deploy --filter api --prod --legacy /deploy/api

# ── Final image ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Chromium for Puppeteer PDF (biên nhận ReceiptPdfService + Đề in ExamPdfRendererService).
# font-liberation: Liberation Serif thay Times New Roman cho Đề in (cùng số đo chữ).
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-liberation \
  && rm -rf /var/cache/apk/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# Production node_modules (includes `prisma` CLI for generate checks/manual ops)
COPY --from=pruner /deploy/api/node_modules ./node_modules
# Compiled JS
COPY --from=builder /app/apps/api/dist ./dist
# Prisma generated client
COPY --from=builder /app/apps/api/generated ./generated
# Prisma schema and migrations (needed for generate checks and manual deploys)
COPY --from=builder /app/apps/api/prisma ./prisma
# Prisma 7: datasource URL lives here (not in schema.prisma); required by Prisma CLI on VPS
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000
CMD ["node", "dist/main.js"]
