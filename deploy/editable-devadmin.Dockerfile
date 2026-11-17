FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
ENV NEXT_PUBLIC_GRIIP_ADMIN_PREFIX=/admin GRIIP_ADMIN_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY . ./
RUN npm run build && rm -rf .next/cache

FROM node:22.22.3-bookworm-slim AS runtime
WORKDIR /app
ENV HOSTNAME=127.0.0.1 PORT=4361 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
CMD ["node", "server.js"]
