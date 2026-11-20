import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.GRIIP_ORIGINAL_ADMIN_APP ??= fileURLToPath(new URL('../', import.meta.url));
const { readMedia, uploadMedia } = await import('../deploy/original-admin/media.mjs');
const { createGateway } = await import('../deploy/original-admin/gateway.mjs');

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

test('Next image requests resolve gateway media only for an authenticated staff session', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'griip-original-next-image-'));
  const key = '11111111-1111-4111-8111-111111111111.jpg';
  const bytes = Buffer.from('ffd8ffe0', 'hex');
  await writeFile(join(directory, key), bytes);
  const staffPhone = '01000000001';
  const backend = createServer((incoming, outgoing) => {
    assert.equal(incoming.url, '/api/v1/user');
    assert.equal(incoming.headers.authorization, 'Bearer fixture.session.token');
    outgoing.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      success: true, data: { _id: 'staff', role_ref: 'owner', role: 'SUPER_ADMIN', status: 'ACTIVE', phone_number: staffPhone },
    }));
  }).listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const origin = new URL('http://devadmin.test');
  const gateway = createGateway({ origin, staffPhone, mediaDirectory: directory,
    backend: new URL(`http://127.0.0.1:${backend.address().port}`), app: new URL('http://127.0.0.1:1') }).listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(async () => {
    await Promise.all([gateway, backend].map(server => new Promise(resolve => server.close(resolve))));
    await rm(directory, { recursive: true, force: true });
  });

  const url = new URL('/admin/_next/image', `http://127.0.0.1:${gateway.address().port}`);
  url.searchParams.set('url', '/admin/api/media/catalog/' + key);
  url.searchParams.set('w', '640');
  url.searchParams.set('q', '75');
  const load = cookie => new Promise((resolve, reject) => {
    const headers = { Host: origin.host };
    if (cookie) headers.Cookie = cookie;
    get(url, { headers }, async response => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve({ status: response.statusCode, type: response.headers['content-type'], body: Buffer.concat(chunks) });
      } catch (error) { reject(error); }
    }).on('error', reject);
  });
  assert.equal((await load()).status, 401);
  const asset = await load('accessToken=fixture.session.token');
  assert.equal(asset.status, 200);
  assert.equal(asset.type, 'image/jpeg');
  assert.deepEqual(asset.body, bytes);
});
