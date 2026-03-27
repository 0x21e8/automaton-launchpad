FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/indexer/package.json apps/indexer/package.json
COPY apps/rpc-gateway/package.json apps/rpc-gateway/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/rpc-gateway apps/rpc-gateway
COPY scripts scripts

RUN npm run build --workspace @ic-automaton/rpc-gateway \
  && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/indexer/package.json ./apps/indexer/package.json
COPY --from=build /app/apps/rpc-gateway/package.json ./apps/rpc-gateway/package.json
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/rpc-gateway/dist ./apps/rpc-gateway/dist

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/rpc-gateway/dist/server.js"]
