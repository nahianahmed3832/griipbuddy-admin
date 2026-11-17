import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.GRIIP_ORIGINAL_ADMIN_APP ??= fileURLToPath(new URL('../', import.meta.url));
const { readMedia, uploadMedia } = await import('../deploy/original-admin/media.mjs');

test('accepts and serves AVIF and TIFF from original image upload forms', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'griip-original-media-'));
  const uploadPath = '/admin/api/v1/upload/single';
  const server = createServer(async (incoming, outgoing) => {
    const path = incoming.url;
    try {
      if (path === uploadPath && incoming.method === 'POST') {
        const uploaded = await uploadMedia(incoming, 'http://127.0.0.1', directory, path);
        outgoing.writeHead(uploaded ? 200 : 400, { 'Content-Type': 'application/json' }).end(JSON.stringify(uploaded));
        return;
      }
      if (!await readMedia(incoming, outgoing, directory, path)) outgoing.writeHead(404).end();
    } catch (error) {
      outgoing.destroy(error);
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [extension, bytes] of [
    ['avif', Buffer.from('000000186674797061766966', 'hex')],
    ['tiff', Buffer.from('49492a0008000000', 'hex')],
  ]) {
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: `image/${extension}` }), `fixture.${extension}`);
    const uploaded = await fetch(origin + uploadPath, { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    const { data } = await uploaded.json();
    assert(data.url.endsWith(`.${extension}`));
    const asset = await fetch(origin + '/admin/api/media/catalog/' + data.url);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), `image/${extension}`);
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), bytes);
  }
});
