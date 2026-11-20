import 'server-only';

import { request } from 'node:http';
import { Readable } from 'node:stream';
import { isProtectedDevAdminOrigin } from './dev-admin-profile';

const publicOrigin = 'https://devadmin.griipbuddy.com';
const bodyHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'content-security-policy'];

export function pinnedAdminGatewayConfigured() {
  return isProtectedDevAdminOrigin() &&
    /^http:\/\/(?:original-admin|127\.0\.0\.1):\d{2,5}$/.test(process.env.GRIIP_ADMIN_LEGACY_MEDIA_ORIGIN ?? '');
}

export function requestPinnedAdmin(path: string, token: string, incoming: Request): Promise<Response> {
  if (!pinnedAdminGatewayConfigured()) return Promise.resolve(new Response(null, { status: 404 }));
  const url = new URL(path, process.env.GRIIP_ADMIN_LEGACY_MEDIA_ORIGIN);
  const method = incoming.method;
  const sourceHeaders = Object.fromEntries(['content-type', 'content-length', 'range'].flatMap(name => {
    const value = incoming.headers.get(name);
    return value ? [[name, value]] : [];
  }));

  return new Promise((resolve, reject) => {
    const upstream = request(url, {
      method,
      headers: { ...sourceHeaders, host: 'devadmin.griipbuddy.com', origin: publicOrigin, authorization: 'Bearer ' + token },
      signal: incoming.signal,
    }, result => {
      const status = result.statusCode ?? 502;
      if (status >= 300 && status < 400) {
        result.resume();
        resolve(new Response(null, { status: 502 }));
        return;
      }
      const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      for (const name of bodyHeaders) {
        const value = result.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      if (method === 'HEAD' || status === 204) {
        result.resume();
        resolve(new Response(null, { status, headers }));
        return;
      }
      const body = Readable.toWeb(result) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status, headers }));
    });
    upstream.on('error', reject);
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('Admin gateway timed out.')));
    if (incoming.body) {
      const body = Readable.fromWeb(incoming.body as Parameters<typeof Readable.fromWeb>[0]);
      body.on('error', error => upstream.destroy(error));
      upstream.on('close', () => body.destroy());
      body.pipe(upstream);
    } else {
      upstream.end();
    }
  });
}
