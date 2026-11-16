ARG ORIGINAL_ADMIN_IMAGE=iazadur/griipbuddy-admin@sha256:a62ed76ae6457dd1a6c6b055428ed7515d83dc52d1ba04a28a1cabb7c710b535
FROM ${ORIGINAL_ADMIN_IMAGE} AS original

FROM node:22.22.3-bookworm-slim AS dependencies
WORKDIR /install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22.22.3-bookworm-slim
WORKDIR /app
COPY --from=original --chown=node:node /app/.next /app/.next
COPY --from=original --chown=node:node /app/public /app/public
COPY --from=original --chown=node:node /app/server.js /app/package.json /app/
COPY --from=dependencies /install/node_modules /app/node_modules
COPY deploy/original-admin/*.mjs /opt/original-admin/
RUN install -d -o node -g node /var/lib/griipbuddy/admin-media
USER node
RUN node /opt/original-admin/configure.mjs /app
CMD ["node", "/opt/original-admin/start.mjs"]
