import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createCatalogMedia, rewriteOriginalCatalogMedia, rewriteOriginalHeroVideo } from '../deploy/original-admin/catalog-media.mjs';
import { createFraudProvider } from '../deploy/original-admin/fraud-provider.mjs';

const publicKey = 'uploads/11111111-1111-4111-8111-111111111111.jpeg';
const privateKey = 'uploads/22222222-2222-4222-8222-222222222222.jpeg';
const unpublishedKey = 'uploads/33333333-3333-4333-8333-333333333333.jpeg';
const videoKey = 'videos/44444444-4444-4444-8444-444444444444.mp4';
const categoryKey = 'uploads/55555555-5555-4555-8555-555555555555.webp';
const heroKey = 'uploads/66666666-6666-4666-8666-666666666666.mp4';
const bannerKey = 'uploads/77777777-7777-4777-8777-777777777777.webp';
const leatherKey = 'uploads/88888888-8888-4888-8888-888888888888.jpg';
const honorKey = 'uploads/99999999-9999-4999-8999-999999999999.jpg';
const legacyBucket = 'https://ggbook.s3.us-east-1.amazonaws.com/rs-leather-bd/';
const cdn = 'https://d11ml80zmgyrxk.cloudfront.net/';

test('proxies only media referenced by the public catalog, taxonomy and CMS and preserves video ranges', async t => {
  const requests = [];
  const upstream = async (url, options) => {
    requests.push(url.href);
    assert.equal(options.redirect, 'error');
    if (url.hostname === 'api.griipbuddy.com') {
      if (url.pathname === '/api/v1/cms/homepage' && url.search === '?populate=full') {
        return Response.json({ data: { new_arrivals: [{ _id: '69b6ee5c482d3ab6681a93b0', slug: 'honor-200', product_ids: [
          { _id: '69b6305d482d3ab6681a8d63', thumbnail: honorKey, is_published: false },
          { _id: '69b6305d482d3ab6681a8d64', thumbnail: privateKey, is_published: false },
        ] }] } });
      }
      const path = url.pathname;
      const publicData = {
        '/api/v1/category': { data: [{ subcategories: [{ sub_subcategories: [{
          third_subcategories: [{ media: [{ image: categoryKey }] }],
        }, { is_published: false, media: [{ image: unpublishedKey }] }] }] }] },
        '/api/v1/cms/hero-section': [{ video_url: heroKey, button: { redirect_route: privateKey } }],
        '/api/v1/cms/banners': { mobile_banners: [{ banner_url: legacyBucket + bannerKey }] },
        '/api/v1/cms/homepage': { leather_section: { enabled: true, banner_image_url: leatherKey } },
      };
      if (Object.hasOwn(publicData, path)) return Response.json({ data: publicData[path] });
      assert.equal(url.pathname, '/api/v1/product');
      const page = Number(url.searchParams.get('page'));
      return Response.json({ data: { meta: { total: 101, page, limit: 100 }, products: page === 1 ? [
        { is_published: true, thumbnail: publicKey, description: privateKey },
        { is_published: false, thumbnail: unpublishedKey },
      ] : [{ is_published: true, short_videos: [{ url: videoKey }] }] } });
    }
    if (url.href === legacyBucket + bannerKey) {
      assert.equal(options.method, 'HEAD');
      return new Response(null, { headers: { 'Content-Type': 'image/webp' } });
    }
    assert.equal(url.origin + '/', cdn);
    if (options.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'image/jpeg' } });
    assert([`/${videoKey}`, `/${heroKey}`].includes(url.pathname));
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
  assert.equal((await fetch(origin + bannerKey)).status, 404);
  assert.equal((await fetch(origin + 'legacy-s3/' + privateKey)).status, 404);
  assert.equal(requests.length, 7);

  const picture = await fetch(origin + publicKey, { method: 'HEAD' });
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/jpeg');
  for (const key of [categoryKey, leatherKey, 'legacy-s3/' + bannerKey, honorKey]) {
    assert.equal((await fetch(origin + key, { method: 'HEAD' })).status, 200);
  }
  for (const key of [videoKey, heroKey]) {
    const video = await fetch(origin + key, { headers: { Range: 'bytes=0-2', Cookie: 'staff=private' } });
    assert.equal(video.status, 206);
    assert.equal(video.headers.get('content-range'), 'bytes 0-2/18');
    assert.equal(await video.text(), 'abc');
  }
  assert.equal(requests.length, 14);
});

test('maps configured absolute media URLs in both compiled image helpers', () => {
  const helpers = [
    String.raw`(e=>{let r=String(e).trim();return r?/^https?:\/\//i.test(r)||r.startsWith("blob:")?r:"${cdn}".concat(r):""})`,
    String.raw`(e=>{let t=String(e).trim();if(!t)return "";if(/^https?:\/\//i.test(t)||t.startsWith("blob:")||t.startsWith("/images/"))return t;let r=t.startsWith("/")?t.slice(1):t;return"${cdn}".concat(r)})`,
  ];
  for (const source of helpers) {
    const mediaUrl = runInNewContext(rewriteOriginalCatalogMedia(source));
    assert.equal(mediaUrl(legacyBucket + bannerKey), '/admin/api/media/catalog/legacy-s3/' + bannerKey);
    assert.equal(mediaUrl(cdn + videoKey), '/admin/api/media/catalog/' + videoKey);
    assert.equal(mediaUrl(categoryKey), '/admin/api/media/catalog/' + categoryKey);
    assert.equal(mediaUrl('/admin/api/media/catalog/' + categoryKey), '/admin/api/media/catalog/' + categoryKey);
    assert.equal(mediaUrl('https://other.example/' + categoryKey), 'https://other.example/' + categoryKey);
  }
});

test('resolves the hero player source without rewriting the selected video value', () => {
  const source = '(url=>{const value={url};return render("video",{src:value.url,controls:!0,className:"w-full rounded-md bg-black"})})';
  const actual = runInNewContext(rewriteOriginalHeroVideo(source), { render: (_, props) => props.src });
  assert.equal(actual(heroKey), '/admin/api/media/catalog/' + heroKey);
  assert.equal(actual(cdn + heroKey), '/admin/api/media/catalog/' + heroKey);
  assert.equal(actual('blob:https://devadmin.griipbuddy.com/preview'), 'blob:https://devadmin.griipbuddy.com/preview');
});
