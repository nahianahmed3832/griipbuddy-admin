import { readMedia } from './media.mjs';

export const storefrontHost = 'dev.griipbuddy.com';
export const storefrontPrefix = '/admin/_storefront-content';
const localKey = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(?:jpg|png|webp|avif|gif|mp4|webm)$/;
const adminMediaPrefix = '/admin/api/media/catalog/';

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
  if (target !== storefrontPrefix) return json(outgoing, 404, { success: false });
  if (incoming.method === 'HEAD') return outgoing.writeHead(200, { 'Content-Type': 'application/json' }).end();
  const [content, homepage, offer] = await Promise.all([
    contentFrom(fetchApi, 'site-content'), contentFrom(fetchApi, 'homepage?populate=full'), contentFrom(fetchApi, 'offer-page'),
  ]);
  return json(outgoing, 200, {
    content: content && Object.fromEntries(['banners', 'mobile_banners', 'featured_products', 'hero_section', 'top_bar_messages']
      .map(section => [section, content[section]])),
    homepage: publicHomepage(homepage),
    offer: offer && {
      offer_start_date: offer.offer_start_date, validFor: offer.validFor, specialSaleActive: offer.specialSaleActive,
      navbar_label: offer.navbar_label, pageConf: { header: offer.pageConf?.header },
    },
  });
}
