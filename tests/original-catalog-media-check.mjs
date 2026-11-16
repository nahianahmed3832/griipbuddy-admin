import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createCatalogMedia } from '../deploy/original-admin/catalog-media.mjs';
import { createFraudProvider } from '../deploy/original-admin/fraud-provider.mjs';

const publicKey = 'uploads/11111111-1111-4111-8111-111111111111.jpeg';
const privateKey = 'uploads/22222222-2222-4222-8222-222222222222.jpeg';
const unpublishedKey = 'uploads/33333333-3333-4333-8333-333333333333.jpeg';
const videoKey = 'videos/44444444-4444-4444-8444-444444444444.mp4';

test('proxies only media referenced by the public catalog and preserves video ranges', async t => {
  const requests = [];
  const upstream = async (url, options) => {
    requests.push(url.href);
    assert.equal(options.redirect, 'error');
    if (url.hostname === 'api.griipbuddy.com') {
      assert.equal(url.pathname, '/api/v1/product');
      const page = Number(url.searchParams.get('page'));
      return Response.json({ data: { meta: { total: 101, page, limit: 100 }, products: page === 1 ? [
        { is_published: true, thumbnail: publicKey, description: privateKey },
        { is_published: false, thumbnail: unpublishedKey },
      ] : [{ is_published: true, short_videos: [{ url: videoKey }] }] } });
    }
    assert.equal(url.hostname, 'd11ml80zmgyrxk.cloudfront.net');
    if (options.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'image/jpeg' } });
    assert.equal(url.pathname, `/${videoKey}`);
    assert.equal(options.headers.Range, 'bytes=0-2');
    assert.equal(options.headers.Cookie, undefined);
    return new Response('abc', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-2/18' } });
  };
  const server = createFraudProvider(undefined, createCatalogMedia(upstream)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/catalog-media/`;

  assert.equal((await fetch(origin + 'pre-orders/receipt.jpeg')).status, 404);
  assert.equal((await fetch(origin + publicKey, { method: 'POST' })).status, 404);
  assert.equal(requests.length, 0);
  assert.equal((await fetch(origin + privateKey)).status, 404);
  assert.equal((await fetch(origin + unpublishedKey)).status, 404);
  assert.equal(requests.length, 2);

  const picture = await fetch(origin + publicKey, { method: 'HEAD' });
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/jpeg');
  const video = await fetch(origin + videoKey, { headers: { Range: 'bytes=0-2', Cookie: 'staff=private' } });
  assert.equal(video.status, 206);
  assert.equal(video.headers.get('content-range'), 'bytes 0-2/18');
  assert.equal(await video.text(), 'abc');
  assert.equal(requests.length, 4);
});
