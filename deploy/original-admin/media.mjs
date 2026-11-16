import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { catalogMediaKey, forwardCatalogMedia } from './catalog-media.mjs';

const require = createRequire(resolve(process.env.GRIIP_ORIGINAL_ADMIN_APP ?? '/app', 'package.json'));
const multipart = require('next/dist/compiled/busboy');

const mediaTypes = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'], ['image/x-icon', 'ico'], ['image/vnd.microsoft.icon', 'ico'], ['application/pdf', 'pdf'],
  ['video/mp4', 'mp4'], ['video/webm', 'webm'], ['video/ogg', 'ogv'], ['video/quicktime', 'mov'],
]);
const mediaPrefix = '/admin/api/media/catalog/';
const uploadFileLimit = 500 * 1024 * 1024;

export async function uploadMedia(incoming, origin, directory, path) {
  const cloudinary = path === '/admin/api/media/video/upload';
  const video = cloudinary || path.includes('/upload/video/');
  const multiple = path.endsWith('/multiple');
  const type = incoming.headers['content-type'];
  if (!type?.startsWith('multipart/form-data;')) return null;
  let parser;
  try {
    parser = multipart({ headers: incoming.headers, limits: { fileSize: uploadFileLimit } });
  } catch {
    return null;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });

  let valid = true;
  const keys = [];
  const writes = [];
  parser.on('file', (field, stream, { mimeType }) => {
    const extension = mediaTypes.get(mimeType);
    if (field !== (multiple ? 'files' : 'file') || !extension || (video && !mimeType.startsWith('video/')) || (!multiple && keys.length)) {
      valid = false;
      stream.resume();
      return;
    }
    const key = `${randomUUID()}.${extension}`;
    const file = createWriteStream(join(directory, key), { mode: 0o600, flags: 'wx' });
    keys.push(key);
    stream.on('limit', () => { valid = false; });
    writes.push(pipeline(stream, file).then(() => {
      if (!file.bytesWritten) valid = false;
    }, () => { valid = false; }));
  });
  await pipeline(incoming, parser).catch(() => { valid = false; });
  await Promise.all(writes);
  if (!valid || !keys.length) {
    await Promise.all(keys.map(key => unlink(join(directory, key)).catch(() => {})));
    return null;
  }
  if (cloudinary) return { secure_url: new URL(`${mediaPrefix}${keys[0]}`, origin).href };
  return {
    success: true,
    statusCode: 200,
    message: multiple ? 'Files uploaded successfully' : 'File uploaded successfully',
    data: multiple ? { urls: keys } : { url: keys[0] },
  };
}

export async function readMedia(incoming, outgoing, directory, path) {
  if (!path.startsWith(mediaPrefix) || !['GET', 'HEAD'].includes(incoming.method)) return false;
  const key = path.slice(mediaPrefix.length);
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.[a-z\d]{3,4}$/.test(key)) return false;
  const type = [...mediaTypes].find(([, extension]) => extension === key.split('.')[1])?.[0];
  if (!type) return false;
  const file = join(directory, key);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;

  const range = incoming.headers.range && /^bytes=(\d+)-(\d*)$/.exec(incoming.headers.range);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
  if (start > end) {
    outgoing.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    return true;
  }
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': type, 'Content-Length': end - start + 1,
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  outgoing.writeHead(range ? 206 : 200, headers);
  if (incoming.method === 'HEAD') outgoing.end();
  else await pipeline(createReadStream(file, { start, end }), outgoing);
  return true;
}

export function readPublishedCatalogMedia(incoming, outgoing, provider, path) {
  if (!provider || !path.startsWith(mediaPrefix) || !['GET', 'HEAD'].includes(incoming.method)) return false;
  const key = path.slice(mediaPrefix.length);
  if (!catalogMediaKey(key)) return false;
  return forwardCatalogMedia(incoming, outgoing, new URL(`/catalog-media/${key}`, provider), key);
}
