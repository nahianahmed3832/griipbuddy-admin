FROM node:22.22.3-bookworm-slim
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg qpdf poppler-utils && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production GRIIP_RECEIPT_QPDF=/usr/bin/qpdf GRIIP_RECEIPT_PDFTOPPM=/usr/bin/pdftoppm
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY recovery ./recovery
RUN install -d -o node -g node -m 0700 /var/lib/griipbuddy/preview-session \
    && install -d -o node -g node /var/lib/griipbuddy/receipts
USER node
CMD ["node", "recovery/hostinger/api.cjs"]
