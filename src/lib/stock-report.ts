import { mongoId } from './api';
import { param, type Query } from './data';
import type { Region } from './sections';

export const stockPath = '/desk/inventory/stock';
export const stockEndpoint = '/stocks/workspace/report';
export const stockColumns = [
  { label:'Product', fields:'product.name' }, { label:'SKU', fields:'variant.sku' },
  { label:'Barcode', fields:'variant.barcode' }, { label:'Location', fields:'location.name|location.business_location_name' },
  { label:'On hand', fields:'available_quantity' }, { label:'Reserved', fields:'qty_reserved' },
  { label:'Received', fields:'total_received' }, { label:'Sold', fields:'total_sold' },
];
export function stockFilters(q: Query, region: Region) {
  const loc = param(q,'location');
  const product = param(q,'product');
  const quantity = (key: string) => {
    const value = param(q,key);
    return value && /^\d{1,8}$/.test(value) ? value : undefined;
  };
  const sort = param(q,'sort');
  return {
    region, q: param(q,'q')?.trim().slice(0,100) || undefined,
    location: loc && mongoId(loc) ? loc : undefined, product: product && mongoId(product) ? product : undefined,
    min: quantity('min'), max: quantity('max'), sort: sort && ['recent', 'product', 'sku', 'quantity'].includes(sort) ? sort : undefined,
    order: param(q,'order') === 'asc' ? 'asc' : undefined,
  };
}
