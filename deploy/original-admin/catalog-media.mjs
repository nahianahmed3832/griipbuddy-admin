import { pipeline } from 'node:stream/promises';

const cdn = 'https://d11ml80zmgyrxk.cloudfront.net';
const legacyBucket = 'https://ggbook.s3.us-east-1.amazonaws.com/rs-leather-bd/';
const api = 'https://api.griipbuddy.com/api/v1/';
const pageSize = 100;
const maxPages = 20;
const cacheTime = 5 * 60_000;
export const catalogMediaPrefix = '/admin/api/media/catalog/';
const sidecarPrefix = '/catalog-media/';
const legacyRoute = 'legacy-s3/';
const imageKey = /^uploads\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:jpe?g|png|webp|gif|avif|apng|bmp|tiff?|heic|heif)$/;
const videoKey = /^(?:videos|uploads)\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:mp4|webm|ogg|ogv|mov)$/;
const optimizedKey = /^catalog\/webp\/([a-f\d]{2})\/\1[a-f\d]{62}\.webp$/;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/apng', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif']);
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);
const sources = [[`${cdn}/`, ''], [legacyBucket, legacyRoute]];
const rows = value => Array.isArray(value) ? value : [];

export function rewriteOriginalCatalogMedia(source) {
  // The preserved Next build has two versions of its media URL helper.
  const originalHelper = /let ([$\w]+)=String\([$\w]+\)\.trim\(\);(?=(?:return|if)[^}]{0,240}"\/admin\/api\/media\/catalog\/"\.concat)/g;
  return source.replaceAll(`${cdn}/`, catalogMediaPrefix).replace(originalHelper, (match, value) => match +
    `if(${value}.startsWith(${JSON.stringify(catalogMediaPrefix)}))return ${value};` +
    sources.map(([origin, prefix]) => `if(${value}.startsWith(${JSON.stringify(origin)}))return ` +
      `${JSON.stringify(catalogMediaPrefix + prefix)}.concat(${value}.slice(${origin.length}));`).join(''));
}

export function rewriteOriginalHeroVideo(source) {
  const player = /(\("video",\{src:)([$\w]+\.url)(,controls:!0,className:"w-full rounded-md bg-black")/;
  return source.replace(player, (_, before, value, after) => {
    const relative = `${value}.startsWith("uploads/")||${value}.startsWith("videos/")`;
    const initial = `${relative}?${JSON.stringify(catalogMediaPrefix)}.concat(${value}):${value}`;
    const normalized = sources.reduceRight((rest, [origin, prefix]) => `${value}.startsWith(${JSON.stringify(origin)})?` +
      `${JSON.stringify(catalogMediaPrefix + prefix)}.concat(${value}.slice(${origin.length})):${rest}`, initial);
    return `${before}${normalized}${after}`;
  });
}

export function catalogMediaKey(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith(legacyRoute)) return imageKey.test(value.slice(legacyRoute.length));
  return imageKey.test(value) || videoKey.test(value) || optimizedKey.test(value);
}

function addReference(keys, value) {
  if (typeof value !== 'string') return;
  const source = sources.find(([origin]) => value.startsWith(origin));
  if (!source && value.startsWith(legacyRoute)) return;
  const key = source ? source[1] + value.slice(source[0].length) : value;
  if (catalogMediaKey(key)) keys.add(key);
}

function addCategoryReferences(category, add) {
  if (!category || category.is_published === false) return;
  add(category.image_url);
  rows(category.media).forEach(media => {
    add(media?.image);
    add(media?.video);
  });
}

function addTaxonomyReferences(categories, add) {
  for (const category of rows(categories?.data)) {
    addCategoryReferences(category, add);
    if (!category || category.is_published === false) continue;
    for (const subcategory of rows(category.subcategories)) {
      addCategoryReferences(subcategory, add);
      if (!subcategory || subcategory.is_published === false) continue;
      for (const child of rows(subcategory.sub_subcategories)) {
        addCategoryReferences(child, add);
        if (child?.is_published !== false) rows(child?.third_subcategories).forEach(item => addCategoryReferences(item, add));
      }
    }
  }
}

function addProductReferences(products, add) {
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
    for (const category of [product.category, product.subcategory, product.sub_subcategory]) addCategoryReferences(category, add);
  }
}

const publicReferences = [
  ['category', addTaxonomyReferences],
  ['cms/banners', (data, add) => [...rows(data?.banners), ...rows(data?.mobile_banners)].forEach(banner => add(banner?.banner_url))],
  ['cms/hero-section', (data, add) => rows(data).forEach(slide => {
    add(slide?.video_url);
    add(slide?.thumbnail_url);
  })],
  ['cms/homepage', (data, add) => {
    if (data?.leather_section?.enabled === true) add(data.leather_section.banner_image_url);
  }],
];

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

  async function readPublicList(path) {
    const response = await request(new URL(path, api), { redirect: 'error', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Unable to read the public media list');
    }
    const { data } = await response.json();
    return data;
  }

  async function readPage(page) {
    const data = await readPublicList(`product?page=${page}&limit=${pageSize}`);
    if (!Array.isArray(data?.products) || data.products.length > pageSize ||
        data.meta?.page !== page || data.meta?.limit !== pageSize ||
        !Number.isInteger(data.meta.total) || data.meta.total < 0 || data.meta.total > maxPages * pageSize) {
      throw new Error('Unexpected public product list');
    }
    return data;
  }

  async function readProducts(add) {
    const first = await readPage(1);
    const remaining = Math.max(0, Math.ceil(first.meta.total / pageSize) - 1);
    const pages = await Promise.all(Array.from({ length: remaining }, (_, index) => readPage(index + 2)));
    addProductReferences(first.products, add);
    pages.forEach(page => addProductReferences(page.products, add));
  }

  async function refreshKeys() {
    const published = new Set();
    const add = value => addReference(published, value);
    const reads = await Promise.allSettled([readProducts(add), ...publicReferences.map(async ([path, collect]) => {
      collect(await readPublicList(path), add);
    })]);
    keys = published;
    expiresAt = Date.now() + (reads.some(read => read.status === 'rejected') ? 30_000 : cacheTime);
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
        if (published.has(key)) {
          const url = key.startsWith(legacyRoute) ? new URL(key.slice(legacyRoute.length), legacyBucket) : new URL(`/${key}`, cdn);
          if (await forwardCatalogMedia(incoming, outgoing, url, key, request)) return true;
        }
      } catch { /* Availability of public media depends on the live catalog. */ }
    }
    outgoing.writeHead(404).end();
    return true;
  };
}
