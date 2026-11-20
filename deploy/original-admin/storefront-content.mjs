import { readMedia } from './media.mjs';

export const storefrontHost = 'dev.griipbuddy.com';
export const storefrontPrefix = '/admin/_storefront-content';
const localKey = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(?:jpg|png|webp|avif|gif|mp4|webm)$/;
const adminMediaPrefix = '/admin/api/media/catalog/';
const mongoId = /^[a-f0-9]{24}$/;

async function contentFrom(fetchApi, path) {
  const response = await fetchApi('/api/v1/cms/' + path);
  if (!response.ok) throw new Error('Dev storefront content is unavailable');
  return (await response.json()).data ?? null;
}

function localMediaKey(value) {
  if (typeof value !== 'string') return null;
  if (localKey.test(value)) return value;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== 'https://devadmin.griipbuddy.com' || !parsed.pathname.startsWith(adminMediaPrefix) ||
        parsed.search || parsed.hash) return null;
    const key = parsed.pathname.slice(adminMediaPrefix.length);
    return localKey.test(key) ? key : null;
  } catch {
    return null;
  }
}

function publishedMedia(content) {
  return [
    ...['banners', 'mobile_banners', 'featured_products'].flatMap(section =>
      (content?.[section] ?? []).map(banner => banner.banner_url)),
    ...(content?.hero_section ?? []).flatMap(slide => [slide.thumbnail_url, slide.video_url]),
    ...(content?.homepage?.shop_by_category ?? []).map(category => category.icon_image_url),
    content?.homepage?.leather_section?.enabled && content.homepage.leather_section.banner_image_url,
  ].map(localMediaKey).filter(Boolean);
}

const reference = row => row && ({ _id: row._id, slug: row.slug, sku: row.sku });
const references = rows => rows?.map(reference).filter(Boolean);

function publicOffer(offer) {
  return offer && {
    offer_start_date: offer.offer_start_date, validFor: offer.validFor, specialSaleActive: offer.specialSaleActive,
    discountPercentage: offer.discountPercentage, freeDelivery: offer.freeDelivery,
    applied_subcategories: references(offer.applied_subcategories),
    navbar_label: offer.navbar_label, pageConf: {
      title: offer.pageConf?.title, header: offer.pageConf?.header,
      timer_config: offer.pageConf?.timer_config && {
        show_timer: offer.pageConf.timer_config.show_timer, mode: offer.pageConf.timer_config.mode,
      },
    },
  };
}

async function offerPrices(fetchApi, ids, offer) {
  const start = Date.parse(offer?.offer_start_date ?? '');
  const now = Date.now();
  if (!offer?.specialSaleActive || !(start <= now && now < start + offer.validFor * 86_400_000)) return [];
  const subcategories = new Set(offer.applied_subcategories?.map(row => row._id));
  if (!subcategories.size) return [];
  const result = await fetchApi('/api/v1/product/ids?ids=' + ids.join(','));
  if (result.status === 404) return [];
  if (!result.ok) throw new Error('Dev storefront offer prices are unavailable');
  const { data } = await result.json();
  if (!Array.isArray(data)) throw new Error('Unexpected dev storefront prices');
  const prices = [];
  for (const row of data) {
    const productId = row?._id;
    const subcategoryId = typeof row?.subcategory === 'string' ? row.subcategory : row?.subcategory?._id;
    if (!ids.includes(productId) || !subcategories.has(subcategoryId) || !row.is_published ||
        row.sale_channels?.website !== true || (row.region != null && row.region !== 'BD') || row.is_deleted === true ||
        (row.catalog_state != null && row.catalog_state !== 'published') || !Array.isArray(row.variants)) continue;
    for (const variant of row.variants) {
      if (variant?.product !== productId || !mongoId.test(variant._id) || typeof variant.regular_price !== 'number') continue;
      const regularMinor = Math.round(variant.regular_price * 100);
      if (Number.isSafeInteger(regularMinor) && regularMinor > 0) {
        prices.push({ productId: 'p-' + productId, variantId: 'v-' + variant._id, subcategoryId, regularMinor });
      }
    }
  }
  return prices;
}

function publicHomepage(homepage) {
  if (!homepage) return null;
  const leather = homepage.leather_section;
  return {
    shop_by_category: homepage.shop_by_category?.map(row => ({
      category_id: reference(row.category_id), subcategory_id: reference(row.subcategory_id),
      label: row.label, icon_image_url: row.icon_image_url, position: row.position,
    })),
    best_selling: homepage.best_selling?.map(row => ({ product_id: reference(row.product_id), position: row.position })),
    new_arrivals: homepage.new_arrivals?.map(row => ({
      name: row.name, slug: row.slug, position: row.position, product_ids: references(row.product_ids),
    })),
    leather_section: leather && {
      enabled: leather.enabled, title: leather.title, subtitle: leather.subtitle, button_text: leather.button_text,
      button_link: leather.button_link, banner_image_url: leather.banner_image_url, product_ids: references(leather.product_ids),
    },
  };
}

export async function serveStorefrontContent(incoming, outgoing, target, fetchApi, mediaDirectory, json) {
  if (!['GET', 'HEAD'].includes(incoming.method)) return json(outgoing, 405, { success: false });
  const mediaPrefix = storefrontPrefix + '/media/';
  if (target.startsWith(mediaPrefix)) {
    const key = target.slice(mediaPrefix.length);
    if (localKey.test(key)) {
      const content = await contentFrom(fetchApi, 'site-content');
      if (publishedMedia(content).includes(key) &&
          await readMedia(incoming, outgoing, mediaDirectory, adminMediaPrefix + key)) return;
    }
    return json(outgoing, 404, { success: false });
  }
  const [path, search] = target.split('?');
  if (path !== storefrontPrefix) return json(outgoing, 404, { success: false });
  if (incoming.method === 'HEAD') return outgoing.writeHead(200, { 'Content-Type': 'application/json' }).end();
  if (search) {
    const query = new URLSearchParams(search);
    const ids = [...new Set(query.get('product_ids')?.split(',') ?? [])];
    if ([...query.keys()].length !== 1 || !ids.length || ids.length > 60 || ids.some(id => !mongoId.test(id))) {
      return json(outgoing, 400, { success: false });
    }
    const offer = publicOffer(await contentFrom(fetchApi, 'offer-page'));
    return json(outgoing, 200, { offer, prices: await offerPrices(fetchApi, ids, offer) });
  }
  const [content, homepage, offer] = await Promise.all([
    contentFrom(fetchApi, 'site-content'), contentFrom(fetchApi, 'homepage?populate=full'), contentFrom(fetchApi, 'offer-page'),
  ]);
  return json(outgoing, 200, {
    content: content && Object.fromEntries(['banners', 'mobile_banners', 'featured_products', 'hero_section', 'top_bar_messages']
      .map(section => [section, content[section]])),
    homepage: publicHomepage(homepage),
    offer: publicOffer(offer),
  });
}
