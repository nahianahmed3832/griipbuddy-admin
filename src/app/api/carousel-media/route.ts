import { createHash } from 'node:crypto';
import { link, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, sameOrigin, session } from '@/lib/api';
import { requireWrite } from '@/lib/advanced';

const MiB = 1024 * 1024;
const maximum = 24 * MiB;
const quota = 240 * MiB;
let uploading = false;

function mediaType(bytes: Buffer) {
  const ascii = (from: number, to: number) => bytes.toString('ascii', from, to);
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') {
    if (['avif', 'avis'].includes(ascii(8, 12))) return 'avif';
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(ascii(8, 12))) return 'mp4';
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && ascii(0, 128).includes('webm')) return 'webm';
}

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const directory = process.env.GRIIP_ADMIN_CAMPAIGN_MEDIA_DIR;
  if (process.env.GRIIP_ADMIN_TARGET !== 'integration' || !directory) return failure('Carousel uploads are unavailable.', 404);
  if (!sameOrigin(request)) return failure('Use the admin editor to upload files.', 403);
  const auth = await session();
  if (!auth) return failure('Sign in to upload carousel media.', 401);
  try { requireWrite(auth, 'cms.view', 'cms.update'); }
  catch (error) {
    if (error instanceof ApiError) return failure(error.message, error.status);
    throw error;
  }

  const size = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size < 12 || size > maximum || !request.body) {
    return failure('Choose a supported file up to 24 MB.', 413);
  }
  if (uploading) return failure('Another upload is in progress. Try again shortly.', 429);
  uploading = true;
  let temporary: string | undefined;
  try {
    const bytes = Buffer.allocUnsafe(size);
    let offset = 0;
    const reader = request.body.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.length + offset > size) return failure('The file was larger than expected.', 413);
        bytes.set(chunk.value, offset);
        offset += chunk.value.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (offset !== size) return failure('The upload was incomplete. Try again.', 400);
    const extension = mediaType(bytes);
    const isVideo = extension === 'mp4' || extension === 'webm';
    if (!extension || (request.headers.get('x-griip-media-kind') === 'video' ? !isVideo : isVideo)) {
      return failure('Choose a JPG, PNG, WebP or AVIF photo, or an MP4 or WebM video in the video field.', 415);
    }
    if (!isVideo && size > 6 * MiB) return failure('Photos can be up to 6 MB.', 413);

    const name = createHash('sha256').update(bytes).digest('hex') + '.' + extension;
    const destination = join(directory, name);
    if (!(await stat(destination).catch(() => undefined))) {
      let used = 0;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isFile()) used += (await stat(join(directory, entry.name))).size;
      }
      if (used + size > quota) return failure('Carousel storage is full. Use a direct media URL or contact support.', 507);
      temporary = join(directory, '.' + name + '.upload');
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o644 });
      await link(temporary, destination);
    }
    return Response.json({ url: 'https://frontend.griipbuddy.com/campaign-media/' + name });
  } catch {
    return failure('The file couldn’t be saved. Try again or use a direct media URL.', 503);
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    uploading = false;
  }
}
