import { pipeline } from 'node:stream/promises';

const cdn = 'https://d11ml80zmgyrxk.cloudfront.net';
const productList = 'https://api.griipbuddy.com/api/v1/product';
const pageSize = 100;
const maxPages = 20;
const cacheTime = 5 * 60_000;
const sidecarPrefix = '/catalog-media/';
const imageKey = /^uploads\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:jpe?g|png|webp|gif)$/;
const videoKey = /^videos\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:mp4|webm|ogg|ogv|mov)$/;
const optimizedKey = /^catalog\/webp\/([a-f\d]{2})\/\1[a-f\d]{62}\.webp$/;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);

export function catalogMediaKey(value) {
  if (typeof value !== 'string') return false;
  return imageKey.test(value) || videoKey.test(value) || optimizedKey.test(value);
}

function addPublishedKeys(products, keys) {
  const rows = value => Array.isArray(value) ? value : [];
  const add = value => {
    if (typeof value !== 'string') return;
    const key = value.startsWith(`${cdn}/`) ? value.slice(cdn.length + 1) : value;
    if (catalogMediaKey(key)) keys.add(key);
  };
  const addVideos = values => rows(values).forEach(video => {
    add(video?.url);
    add(video?.thumbnail);
  });
  for (const product of products) {
    if (product?.is_published !== true) continue;
    add(product.thumbnail);
    rows(product.slider_images).forEach(add);
    addVideos(product.short_videos);
    for (const variant of rows(product.variants)) {
      add(variant?.image);
      rows(variant?.images).forEach(add);
      addVideos(variant?.videos);
    }
    for (const category of [product.category, product.subcategory, product.sub_subcategory]) {
      if (!category || category.is_published === false) continue;
      add(category.image_url);
      rows(category.media).forEach(media => add(media?.image));
    }
  }
}

export async function forwardCatalogMedia(incoming, outgoing, url, key, request = fetch) {
  const headers = { 'Accept-Encoding': 'identity' };
  if (/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(incoming.headers.range ?? '')) headers.Range = incoming.headers.range;
  let asset;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  outgoing.once('close', cancel);
  try {
    asset = await request(url, { method: incoming.method, headers, redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
    const types = videoKey.test(key) ? videoTypes : imageTypes;
    if (asset.status === 416) {
      const contentRange = asset.headers.get('content-range');
      if (contentRange) outgoing.setHeader('Content-Range', contentRange);
      outgoing.writeHead(416).end();
      return true;
    }
    const type = asset.headers.get('content-type')?.split(';', 1)[0];
    if (![200, 206].includes(asset.status) || !types.has(type) || (incoming.method === 'GET' && !asset.body)) return false;
    for (const name of ['accept-ranges', 'content-length', 'content-range']) {
      const value = asset.headers.get(name);
      if (value) outgoing.setHeader(name, value);
    }
    outgoing.setHeader('Content-Type', type);
    outgoing.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    outgoing.writeHead(asset.status);
    if (incoming.method === 'HEAD') outgoing.end();
    else await pipeline(asset.body, outgoing);
    return true;
  } catch {
    if (!outgoing.headersSent && !outgoing.destroyed) return false;
    outgoing.destroy();
    return true;
  } finally {
    outgoing.removeListener('close', cancel);
    if (asset?.body && !asset.body.locked) await asset.body.cancel().catch(() => {});
  }
}

export function createCatalogMedia(request = fetch) {
  let keys;
  let expiresAt = 0;
  let refresh;

  async function readPage(page) {
    const url = new URL(productList);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(pageSize));
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Unable to read the public product list');
    }
    const { data } = await response.json();
    if (!Array.isArray(data?.products) || data.products.length > pageSize ||
        data.meta?.page !== page || data.meta?.limit !== pageSize ||
        !Number.isInteger(data.meta.total) || data.meta.total < 0 || data.meta.total > maxPages * pageSize) {
      throw new Error('Unexpected public product list');
    }
    return data;
  }

  async function refreshKeys() {
    const first = await readPage(1);
    const remaining = Math.max(0, Math.ceil(first.meta.total / pageSize) - 1);
    const pages = await Promise.all(Array.from({ length: remaining }, (_, index) => readPage(index + 2)));
    const published = new Set();
    addPublishedKeys(first.products, published);
    pages.forEach(page => addPublishedKeys(page.products, published));
    keys = published;
    expiresAt = Date.now() + cacheTime;
    return keys;
  }

  return async (incoming, outgoing) => {
    const path = incoming.url ?? '';
    if (!path.startsWith(sidecarPrefix)) return false;
    const key = path.slice(sidecarPrefix.length);
    if (['GET', 'HEAD'].includes(incoming.method) && catalogMediaKey(key)) {
      try {
        if (Date.now() >= expiresAt) refresh ??= refreshKeys().finally(() => { refresh = undefined; });
        const published = refresh ? await refresh : keys;
        if (published.has(key) && await forwardCatalogMedia(incoming, outgoing, new URL(`/${key}`, cdn), key, request)) return true;
      } catch { /* Availability of public media depends on the live catalog. */ }
    }
    outgoing.writeHead(404).end();
    return true;
  };
}
