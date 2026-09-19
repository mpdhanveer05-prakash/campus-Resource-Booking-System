# Multi-stage build for the API.
# Stage 1 installs production dependencies only; stage 2 carries just what runs.
FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# npm ci honours the lockfile exactly; --omit=dev keeps test tooling out.
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user rather than root.
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts

EXPOSE 4000

# Liveness only: readiness is polled by the platform, not the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
