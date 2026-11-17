import type { Region } from './sections';

export const productionStockPath = '/dashboard/check-outlet-stocks';
export const stockSorts = [
  ['available_quantity', 'Available Quantity'], ['product.name', 'Product Name'], ['sku', 'SKU'],
  ['sale_price', 'Sale Price'], ['regular_price', 'Regular Price'], ['total_sold', 'Total Sold'],
  ['createdAt', 'Created Date'], ['updatedAt', 'Updated Date'],
] as const;
export const stockPageSizes = ['20', '40', '60', '80', '100', 'all'];

export type ProductionStockFilters = {
  region: Region; businessLocation?: string; skuQuery?: string; searchQuery?: string; sortBy: string; sortOrder: 'asc' | 'desc';
};

export function stockSearchPath(filters: ProductionStockFilters, other: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  const values = { ...filters, ...other };
  Object.entries(values).forEach(([key, value]) => {
    if (value && !(key === 'region' && value === 'BD') && !(key === 'sortBy' && value === 'available_quantity') &&
      !(key === 'sortOrder' && value === 'desc')) query.set(key, value);
  });
  return productionStockPath + (query.size ? '?' + query : '');
}

