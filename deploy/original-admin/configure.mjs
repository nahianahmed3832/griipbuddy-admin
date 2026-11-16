import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBasePath } from './base-path.mjs';

const app = process.argv[2];
if (!app) throw new Error('An original admin artifact directory is required');
const backend = new URL(process.env.GRIIP_ORIGINAL_ADMIN_BACKEND ?? 'http://api:38100');
if (!['http://api:38100/', 'http://127.0.0.1:14801/', 'http://127.0.0.1:14803/', 'http://127.0.0.1:14819/'].includes(backend.href)) {
  throw new Error('The original admin requires an isolated backend');
}
applyBasePath(app, '/admin');

// Browser traffic goes through the protected gateway. Server rendering uses
// the same private API directly, as the original standalone build does.
for (const root of ['static', 'server']) {
  const directory = join(app, '.next', root);
  const api = root === 'server' ? `${backend.origin}/api/v1` : '/admin/api/v1';
  for (const relative of readdirSync(directory, { recursive: true })) {
    if (!/\.(?:js|html|json|rsc|txt)$/.test(relative)) continue;
    const file = join(directory, relative);
    const source = readFileSync(file, 'utf8');
    const updated = source.replaceAll('https://api.griipbuddy.com/api/v1', api)
      .replaceAll('__NEXT_PUBLIC_BASE_SERVER_API__', api)
      .replaceAll('__NEXT_PUBLIC_FILE_UPLOAD_API_KEY__', 'fixture-upload')
      .replaceAll('https://api.cloudinary.com/v1_1/dxqzawk38', '/admin/api/media')
      .replaceAll('https://d11ml80zmgyrxk.cloudfront.net/', '/admin/api/media/catalog/')
      .replaceAll('sameSite:"None",path:"/"', 'sameSite:"Strict",path:"/admin"')
      .replaceAll('remove(e,{path:"/"})', 'remove(e,{path:"/admin"})');
    if (source !== updated) writeFileSync(file, updated);
  }
}

const actions = JSON.parse(readFileSync(join(app, '.next/server/server-reference-manifest.json'), 'utf8'));
if (Object.keys(actions.node).length || Object.keys(actions.edge).length) {
  throw new Error('The original dev gateway does not publish Next server actions');
}
