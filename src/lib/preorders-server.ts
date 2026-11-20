import { ApiError, arr, canWrite, obj, str, type Session } from './api';
import { has, type Region } from './sections';
import type { Products } from './preorders';

export function preOrderAccess(auth: Session, region: Region) {
  if (!has(auth.staff, 'pre_order.view') || region !== 'BD') throw new ApiError(403);
  const writes = canWrite(auth.staff);
  return {
    create: writes && has(auth.staff, 'pre_order.create'),
    update: writes && has(auth.staff, 'pre_order.update'),
    remove: writes && has(auth.staff, 'pre_order.delete'),
    products: has(auth.staff, 'product.view'),
  };
}

export function preOrderProducts(value: unknown): Products {
  return arr(obj(value).data).map(obj).flatMap(row => {
    const product = obj(row.product);
    const id = str(product._id) || str(row.product);
    if (!id) return [];
    const name = str(product.name) || str(row.product_name) || str(row.sku);
    const attributes = Object.fromEntries(Object.entries(obj(row.attribute_values)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const price = typeof row.sale_price === 'number' && row.sale_price > 0 ? row.sale_price
      : typeof row.regular_price === 'number' ? row.regular_price : undefined;
    return [{ id, name, sku: str(row.sku), image: str(row.image) || str(product.thumbnail), attributes, price }];
  });
}
