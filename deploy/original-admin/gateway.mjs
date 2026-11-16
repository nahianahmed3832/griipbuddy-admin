import { createServer, request } from 'node:http';
import { allowedOriginalApiPath, requiredOriginalMutationPermission } from './api-policy.mjs';
import { readMedia, uploadMedia } from './media.mjs';

const prefix = '/admin';
const apiPrefix = `${prefix}/api/v1`;
const loginPath = `${apiPrefix}/user/admin/login`;
const jwt = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const requestHeaders = ['accept', 'accept-language', 'content-length', 'content-type', 'cookie', 'if-none-match', 'if-modified-since', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'next-url', 'range', 'rsc', 'user-agent'];
const responseHeaders = ['accept-ranges', 'content-disposition', 'content-encoding', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified', 'location', 'set-cookie', 'vary'];
const csp = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'", "img-src 'self' data: blob:", "font-src 'self'", "media-src 'self' blob:",
  "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function relay(incoming, outgoing, upstream, path, headers, publicOrigin) {
  const forwarded = request(new URL(path, upstream), { method: incoming.method, headers }, reply => {
    const allowed = Object.fromEntries(responseHeaders.filter(name => reply.headers[name] !== undefined)
      .map(name => [name, reply.headers[name]]));
    if (path.startsWith(`${prefix}/_next/static/`) && [200, 304].includes(reply.statusCode)) {
      allowed['cache-control'] = 'private, max-age=900, immutable';
    }
    if (allowed.location) {
      try {
        const redirect = new URL(allowed.location, publicOrigin);
        if (validPath(redirect.pathname)) allowed.location = redirect.pathname + redirect.search + redirect.hash;
        else delete allowed.location;
      } catch { delete allowed.location; }
    }
    outgoing.writeHead(reply.statusCode, allowed);
    reply.pipe(outgoing);
    outgoing.on('close', () => reply.destroy());
  });
  forwarded.setTimeout(25_000, () => forwarded.destroy());
  forwarded.on('error', () => {
    if (outgoing.headersSent) outgoing.destroy();
    else json(outgoing, 502, { success: false, message: 'The dev admin upstream is unavailable.' });
  });
  incoming.on('aborted', () => forwarded.destroy());
  incoming.pipe(forwarded);
}

async function readJson(incoming) {
  const buffer = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > 8192) throw new Error('Invalid JSON request');
    buffer.push(chunk);
  }
  return JSON.parse(Buffer.concat(buffer));
}

function cookieToken(incoming) {
  const token = incoming.headers.cookie?.match(/(?:^|;\s*)accessToken=([^;]+)/)?.[1];
  return token && token.length <= 2048 && jwt.test(token) ? token : undefined;
}

function validPath(path) {
  try {
    return /^\/admin(?:\/|$)/.test(path) && !/\/\//.test(path) && path.split('/').every(segment => {
      const value = decodeURIComponent(segment);
      return value !== '.' && value !== '..' && !/[\u0000-\u001f%/\\?#]/.test(value);
    });
  } catch {
    return false;
  }
}

export function createGateway({ origin, backend, app, staffPhone, recovery, mediaDirectory, fraudOrigin }) {
  const unsafe = method => !['GET', 'HEAD'].includes(method);
  const authHeaders = token => ({ Accept: 'application/json', Authorization: `Bearer ${token}` });
  const http = (path, init) => fetch(new URL(path, backend), { ...init, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  const pendingProfiles = new Map();

  async function readStaff(token) {
    const profile = await http('/api/v1/user', { headers: authHeaders(token) });
    if (!profile.ok) return null;
    const payload = await profile.json();
    const { success, data } = payload;
    if (!success || !data?._id || !data.role_ref || !data.role || data.role === 'USER' || data.isDeleted || data.status !== 'ACTIVE') return null;
    return recovery || data.phone_number === staffPhone || data.staffEnrollmentCompleted === true ? payload : null;
  }

  function staff(token) {
    if (!token || token.length > 2048 || !jwt.test(token)) return null;
    const pending = pendingProfiles.get(token);
    if (pending) return pending;
    const current = readStaff(token).finally(() => pendingProfiles.delete(token));
    pendingProfiles.set(token, current);
    return current;
  }

  async function handle(incoming, outgoing) {
    outgoing.setHeader('Cache-Control', 'private, no-store');
    outgoing.setHeader('Content-Security-Policy', csp);
    outgoing.setHeader('Referrer-Policy', 'same-origin');
    outgoing.setHeader('X-Content-Type-Options', 'nosniff');
    outgoing.setHeader('X-Frame-Options', 'DENY');
    outgoing.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const target = incoming.url ?? '';
    const path = target.split('?')[0];
    if (incoming.headers.host !== origin.host || !validPath(path)) {
      return json(outgoing, 404, { success: false, message: 'Not found.' });
    }

    const isApi = path.startsWith(`${apiPrefix}/`);
    const isFraud = path === `${prefix}/api/fraud-check`;
    const isMedia = path.startsWith(`${prefix}/api/media/`);
    if (isApi || isFraud || isMedia) {
      if (isApi && !allowedOriginalApiPath(path.slice(prefix.length), incoming.method)) {
        return json(outgoing, 404, { success: false, message: 'Not found.' });
      }
      if (incoming.headers['sec-fetch-site'] === 'cross-site' ||
          (incoming.headers.origin && incoming.headers.origin !== origin.origin) ||
          (unsafe(incoming.method) && incoming.headers.origin !== origin.origin)) {
        return json(outgoing, 403, { success: false, message: 'This request must come from the dev admin.' });
      }
      if (path === loginPath && incoming.method === 'POST') {
        let input;
        try {
          input = await readJson(incoming);
        } catch {
          return json(outgoing, 400, { success: false, message: 'Invalid sign-in request.' });
        }
        const phone = input?.phone_number;
        const password = input?.password;
        if (typeof phone !== 'string' || !/^\+?\d{8,16}$/.test(phone) || typeof password !== 'string' || !password.length || password.length > 256) {
          return json(outgoing, 400, { success: false, message: 'Invalid sign-in request.' });
        }
        const result = await http('/api/v1/user/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: phone, password }) });
        const payload = await result.json();
        if (result.ok && !(await staff(payload.data?.access_token))) {
          return json(outgoing, 403, { success: false, message: 'This account cannot access the dev admin.' });
        }
        return json(outgoing, result.status, payload);
      }

      const token = incoming.headers.authorization?.replace(/^Bearer /i, '') ?? cookieToken(incoming);
      const identity = await staff(token);
      if (!identity) {
        if (isFraud) {
          outgoing.writeHead(302, { Location: `${prefix}/sign-in` }).end();
          return;
        }
        return json(outgoing, 401, { success: false, message: 'Staff sign-in required.' });
      }
      if (target === `${apiPrefix}/user` && incoming.method === 'GET') return json(outgoing, 200, identity);
      const profile = identity.data;
      const uploadPath = /^\/admin\/api\/(?:media\/video\/upload|v1\/upload\/(?:video\/)?(?:single|multiple))$/.test(path);
      if (uploadPath && incoming.method === 'POST') {
        const payload = await uploadMedia(incoming, origin, mediaDirectory, path);
        return payload ? json(outgoing, 200, payload) : json(outgoing, 400, { success: false, message: 'Upload file is invalid.' });
      }
      if (isMedia && await readMedia(incoming, outgoing, mediaDirectory, path)) return;
      if (isApi) {
        const apiPath = path.slice(prefix.length);
        const permission = requiredOriginalMutationPermission(apiPath, incoming.method);
        const hasPermission = key => profile.role === 'SUPER_ADMIN' ||
          (Array.isArray(profile.permissions) && profile.permissions.includes(key));
        if (permission && !hasPermission(permission)) {
          const canToggle = incoming.method === 'PATCH' && /^\/api\/v1\/category\/[^/]+$/.test(apiPath) && hasPermission('product.view');
          const changes = canToggle ? await readJson(incoming).catch(() => null) : null;
          if (!changes || Object.keys(changes).length !== 1 || typeof changes.is_published !== 'boolean') {
            return json(outgoing, 403, { success: false, message: 'Permission denied.' });
          }
          const result = await http(target.slice(prefix.length), { method: 'PATCH',
            headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
          return json(outgoing, result.status, await result.json());
        }
        const headers = Object.fromEntries(['accept', 'content-type', 'content-length'].filter(name => incoming.headers[name])
          .map(name => [name, incoming.headers[name]]));
        relay(incoming, outgoing, backend, target.slice(prefix.length), { ...headers, Authorization: `Bearer ${token}` }, origin);
        return;
      }
      if (isFraud && incoming.method === 'GET') {
        const phone = new URL(target, origin).searchParams.get('phone');
        if (!phone) return json(outgoing, 400, { error: 'Phone number is required' });
        if (fraudOrigin && /^01\d{9}$/.test(phone)) {
          try {
            const result = await fetch(new URL(`/api/v1/fraud-checker/${phone}`, fraudOrigin), {
              headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(9000),
            });
            if (result.ok) return json(outgoing, 200, await result.json());
          } catch { /* Preserve the original provider error response. */ }
        }
        return json(outgoing, 500, { error: 'Failed to fetch fraud data' });
      }
      return json(outgoing, 404, { success: false, message: 'Not found.' });
    }

    if (unsafe(incoming.method) || path.startsWith(`${prefix}/api/`)) return json(outgoing, 404, { success: false, message: 'Not found.' });

    const headers = Object.fromEntries(requestHeaders.filter(name => incoming.headers[name] !== undefined)
      .map(name => [name, incoming.headers[name]]));
    relay(incoming, outgoing, app, target, { ...headers, host: origin.host, 'x-forwarded-host': origin.host, 'x-forwarded-proto': origin.protocol.slice(0, -1) }, origin);
  }

  return createServer((incoming, outgoing) => {
    handle(incoming, outgoing).catch(() => {
      if (outgoing.headersSent) outgoing.destroy();
      else json(outgoing, 502, { success: false, message: 'The dev admin upstream is unavailable.' });
    });
  });
}
