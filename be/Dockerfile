FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 4000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
