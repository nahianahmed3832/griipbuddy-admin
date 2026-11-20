import { productionCmsPreview } from './production-cms-media';

const mongoId = (value: string) => /^[a-f\d]{24}$/i.test(value);
const str = (value: unknown) => typeof value === 'string' ? value : '';
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

export type ContentProduct = { id: string; name: string; image?: string };

export function productReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(productReferences);
  if (typeof value === 'string') return mongoId(value) ? [value.toLowerCase()] : [];
  const row = obj(value);
  return [row.product_id, row.product_ids, row.products_id].flatMap(item => item ? productReferences(item) : []);
}

export function contentProduct(row: unknown): ContentProduct {
  const product = obj(row);
  return { id: str(product.id) || str(product._id), name: str(product.name) || str(product.sku),
    image: str(product.image) || str(product.thumbnail) };
}

export function contentProductImage(value: string | undefined) {
  const url = productionCmsPreview(value || '');
  if (/^\/(?![/\\])[^\s\\]*$/.test(url)) return url;
  try {
    const address = new URL(url);
    if (address.protocol === 'https:' && !address.username && !address.password) return address.href;
  } catch { /* Empty or unavailable thumbnail. */ }
}
