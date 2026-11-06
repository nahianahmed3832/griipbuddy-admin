FROM node:22.22.3-bookworm-slim
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY recovery ./recovery
RUN mkdir -p /var/lib/griipbuddy/receipts && chown node:node /var/lib/griipbuddy/receipts
USER node
CMD ["node", "recovery/hostinger/api.cjs"]
