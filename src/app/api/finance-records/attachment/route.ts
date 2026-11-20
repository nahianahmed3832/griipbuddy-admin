import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import sharp from 'sharp';
import { canWrite, sameOrigin, session } from '@/lib/api';
import { financeAttachmentPrefix } from '@/lib/finance-attachment';
import { has } from '@/lib/sections';

const limit = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied.', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required.', { status: 401 });
  if (!canWrite(auth.staff) || !has(auth.staff, 'expense.view') || !['expense.create', 'expense.update'].some(permission => has(auth.staff, permission))) {
    return new Response('Access restricted.', { status: 403 });
  }
  const location = process.env.GRIIP_ADMIN_EXPENSE_MEDIA_DIR ?? '';
  if (!isAbsolute(location)) return new Response('Attachment storage is unavailable.', { status: 503 });
  const type = request.headers.get('content-type') ?? '';
  const length = Number(request.headers.get('content-length'));
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type) || !Number.isSafeInteger(length) || length < 1 || length > limit) {
    return new Response('Choose a PNG, JPEG or WebP image up to 5 MB.', { status: 415 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length !== length) return new Response('The upload was incomplete.', { status: 400 });
  let image: Buffer;
  try {
    const source = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error();
    image = await source.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch { return new Response('The file is not a supported image.', { status: 415 }); }
  const key = randomUUID().replaceAll('-', '') + '.png';
  try { await writeFile(join(location, key), image, { flag: 'wx', mode: 0o600 }); }
  catch { return new Response('Could not save the attachment.', { status: 503 }); }
  return Response.json({ path: financeAttachmentPrefix + key }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
