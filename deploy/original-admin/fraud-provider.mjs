import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const provider = 'https://efraudchecker.zephix.io';
const path = /^\/api\/v1\/fraud-checker\/01\d{9}$/;
const maxResponseSize = 128 * 1024;

export function createFraudProvider(lookup = fetch) {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || !path.test(request.url ?? '')) {
      response.writeHead(404).end();
      return;
    }

    try {
      const upstream = await lookup(new URL(request.url, provider), {
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel();
        response.writeHead(502).end();
        return;
      }

      const chunks = [];
      let size = 0;
      for await (const chunk of upstream.body) {
        size += chunk.byteLength;
        if (size > maxResponseSize) throw new Error('Fraud response exceeds the size limit');
        chunks.push(chunk);
      }
      response.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      response.end(Buffer.concat(chunks, size));
    } catch {
      response.writeHead(502).end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createFraudProvider().listen(8080, '0.0.0.0');
}
