# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Standalone output only traces files actually imported at runtime, so the
# Prisma CLI (a devDependency, only used for one-off `migrate deploy`) never
# makes it in. Run migrations from this stage instead — it still has the
# full node_modules + prisma/migrations from the build.
FROM builder AS migrator
WORKDIR /app
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Pre-create the file pool dir owned by the runtime user — when Docker
# mounts an empty named volume here, it copies this dir's ownership onto
# the volume on first run, so uploads work without a root-owned mount.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
