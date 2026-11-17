import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBasePath } from './base-path.mjs';
import { rewriteOriginalCatalogMedia, rewriteOriginalHeroVideo } from './catalog-media.mjs';
import { patchManagedReceipt } from './managed-receipt.mjs';
import { patchManagedShipment } from './managed-shipment.mjs';
import { patchStaffPassword } from './staff-password.mjs';

const app = process.argv[2];
if (!app) throw new Error('An original admin artifact directory is required');
const backend = new URL(process.env.GRIIP_ORIGINAL_ADMIN_BACKEND ?? 'http://api:38100');
if (!['http://api:38100/', 'http://127.0.0.1:14801/', 'http://127.0.0.1:14803/', 'http://127.0.0.1:14819/'].includes(backend.href)) {
  throw new Error('The original admin requires an isolated backend');
}
applyBasePath(app, '/admin');
const next = join(app, '.next');
const originalLoginChunk = 'page-4a794a36ace8264e.js';
const loginChunk = 'page-4a794a36ace8264e-email.js';
const originalOrderChunk = 'page-ed397c6f7e77af22.js';
const orderChunk = 'page-ed397c6f7e77af22-operations.js';
const orderDirectory = 'chunks/app/(dashboard)/dashboard/(orders)/order-details/[id]/';
const originalStaffChunk = '7662-bfc447cf9b3f10e4.js';
const staffChunk = '7662-bfc447cf9b3f10e4-staff-password.js';
const staffPages = new Set([
  'app/(dashboard)/dashboard/(manage-staffs)/add-new-staff/page.js',
  'app/(dashboard)/dashboard/(manage-staffs)/update-staff/[slug]/page.js',
]);
const originalLoginValidation = '.min(11,"Phone number should be 11 digits").max(11,"Phone number should be 11 digits")';
const loginValidation = '.trim().refine(value=>/^\\+?\\d{8,16}$/.test(value)||/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value),"Enter a phone number or email address")';
const manifestPath = join(next, 'app-build-manifest.json');
const manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes(originalLoginChunk) || !manifest.includes(originalOrderChunk) || !manifest.includes(originalStaffChunk)) {
  throw new Error('Unexpected preserved login, order or staff chunk');
}
writeFileSync(manifestPath, manifest.replaceAll(originalLoginChunk, loginChunk)
  .replaceAll(originalOrderChunk, orderChunk).replaceAll(originalStaffChunk, staffChunk));

// Browser traffic goes through the protected gateway. Server rendering uses
// the same private API directly, as the original standalone build does.
for (const root of ['static', 'server']) {
  const directory = join(next, root);
  const api = root === 'server' ? `${backend.origin}/api/v1` : '/admin/api/v1';
  for (const relative of readdirSync(directory, { recursive: true })) {
    if (!/\.(?:js|html|json|rsc|txt)$/.test(relative)) continue;
    const file = join(directory, relative);
    const source = readFileSync(file, 'utf8');
    let updated = rewriteOriginalCatalogMedia(source).replaceAll(originalLoginChunk, loginChunk)
      .replaceAll(originalOrderChunk, orderChunk)
      .replaceAll(originalStaffChunk, staffChunk)
      .replaceAll('https://api.griipbuddy.com/api/v1', api)
      .replaceAll('__NEXT_PUBLIC_BASE_SERVER_API__', api)
      .replaceAll('__NEXT_PUBLIC_FILE_UPLOAD_API_KEY__', 'fixture-upload')
      .replaceAll('https://api.cloudinary.com/v1_1/dxqzawk38', '/admin/api/media')
      .replaceAll('sameSite:"None",path:"/"', 'sameSite:"Strict",path:"/admin"')
      .replaceAll('remove(e,{path:"/"})', 'remove(e,{path:"/admin"})');
    const loginScript = (root === 'static' && relative === 'chunks/app/' + originalLoginChunk) ||
      (root === 'server' && relative === 'app/page.js');
    if (loginScript) {
      if (updated.split(originalLoginValidation).length !== 2) throw new Error('Unexpected login validation in ' + relative);
      updated = updated.replace(originalLoginValidation, loginValidation);
    }
    if (loginScript || (root === 'server' && relative === 'app/index.html')) {
      updated = updated.replaceAll('Phone Number', 'Phone Number or Email')
        .replaceAll('Enter your phone number', 'Enter your phone number or email');
    }
    if (relative.endsWith('/hero-section/page-6812248b81ef63b9.js') ||
        (root === 'server' && relative.endsWith('/hero-section/page.js'))) {
      const hero = rewriteOriginalHeroVideo(updated);
      if (hero === updated) throw new Error('Unexpected hero video player in ' + relative);
      updated = hero;
    }
    if ((root === 'static' && relative === orderDirectory + originalOrderChunk) ||
        (root === 'server' && relative === 'app/(dashboard)/dashboard/(orders)/order-details/[id]/page.js')) {
      updated = patchManagedReceipt(updated, root === 'server');
      updated = patchManagedShipment(updated, root === 'server');
    }
    if ((root === 'static' && relative === 'chunks/' + originalStaffChunk) ||
        (root === 'server' && staffPages.has(relative))) {
      updated = patchStaffPassword(updated);
    }
    if (source !== updated) writeFileSync(file, updated);
  }
}
renameSync(join(next, 'static/chunks/app', originalLoginChunk), join(next, 'static/chunks/app', loginChunk));
renameSync(join(next, 'static', orderDirectory, originalOrderChunk), join(next, 'static', orderDirectory, orderChunk));
renameSync(join(next, 'static/chunks', originalStaffChunk), join(next, 'static/chunks', staffChunk));

const actions = JSON.parse(readFileSync(join(app, '.next/server/server-reference-manifest.json'), 'utf8'));
if (Object.keys(actions.node).length || Object.keys(actions.edge).length) {
  throw new Error('The original dev gateway does not publish Next server actions');
}
