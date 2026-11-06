FROM node:22.22.3-bookworm-slim AS build
ARG NEXT_PUBLIC_GRIIP_ADMIN_PREFIX
ENV NEXT_PUBLIC_GRIIP_ADMIN_PREFIX=${NEXT_PUBLIC_GRIIP_ADMIN_PREFIX} NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22.22.3-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
CMD ["npm","run","start"]
