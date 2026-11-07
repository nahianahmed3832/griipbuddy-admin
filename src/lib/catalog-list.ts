import { api, arr, mongoId, obj, str, url, type RecordData, type Session } from './api';
import { param, type Query } from './data';
import type { Region } from './sections';

export const catalogPath = '/desk/catalog/products';
export const categoryKeys = ['category', 'subcategory', 'subSubcategory', 'thirdSubcategory'] as const;
const categoryFields = ['category', 'subcategory', 'sub_subcategory', 'third_subcategory'] as const;
const categoryChildren = ['subcategories', 'sub_subcategories', 'third_subcategories'] as const;
const backendCategoryKeys = ['categoryId', 'subcategoryId', 'subSubcategoryId', 'thirdSubcategoryId'];
export const catalogSorts = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name: A to Z', nameDesc: 'Name: Z to A' } as const;
export const catalogPageSizes = [20, 40, 60];
export type CategoryOption = { id: string; name: string; children: CategoryOption[] };
export type Choice = { value: string; label: string };
export type CatalogFilters = ReturnType<typeof catalogFilters>;

export function catalogFilters(query: Query, canViewStock: boolean, canViewLocations: boolean) {
  const sort = param(query, 'sort') ?? '';
  const publication = param(query, 'filter');
  const stock = param(query, 'stock');
  const location = param(query, 'location') ?? '';
  const page = Number(param(query, 'page'));
  const size = Number(param(query, 'size'));
  const category: string[] = [];
  for (const key of categoryKeys) {
    const id = param(query, key) ?? '';
    if (!mongoId(id)) break;
    category.push(id.toLowerCase());
  }
  return {
    q: (param(query, 'q') ?? '').trim().slice(0, 80),
    searchBy: param(query, 'searchBy') === 'sku' ? 'sku' : 'text',
    filter: publication === 'true' || publication === 'false' ? publication : '',
    category,
    stock: canViewStock && (stock === 'in' || stock === 'out') ? stock : '',
    location: canViewLocations && mongoId(location) ? location.toLowerCase() : '',
    sort: Object.hasOwn(catalogSorts, sort) ? sort as keyof typeof catalogSorts : 'newest' as const,
    page: Number.isInteger(page) ? Math.min(10000, Math.max(1, page)) : 1,
    size: catalogPageSizes.includes(size) ? size : catalogPageSizes[0],
  };
}

export function catalogParams(f: CatalogFilters, region: Region): Record<string, string | undefined> {
  return {
    region, q: f.q, searchBy: f.searchBy === 'sku' ? 'sku' : undefined, filter: f.filter,
    ...Object.fromEntries(categoryKeys.map((key, index) => [key, f.category[index]])),
    stock: f.stock, location: f.location, sort: f.sort === 'newest' ? undefined : f.sort,
    page: f.page === 1 ? undefined : String(f.page), size: f.size === catalogPageSizes[0] ? undefined : String(f.size),
  };
}

export async function loadCatalog(auth: Session, f: CatalogFilters, region: Region) {
  const search = f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = obj(await api(url('/product/admin/all', {
    region, [f.searchBy === 'sku' ? 'sku' : 'searchQuery']: search,
    isPublished: f.filter, stock: f.stock, businessLocationId: f.location,
    ...Object.fromEntries(backendCategoryKeys.map((key, index) => [key, f.category[index]])),
    sortBy: f.sort === 'name' || f.sort === 'nameDesc' ? 'name' : 'createdAt',
    sortOrder: f.sort === 'name' || f.sort === 'oldest' ? 'asc' : 'desc',
    page: String(f.page), limit: String(f.size),
  }), auth.token));
  const total = obj(result.meta).total;
  return { rows: arr(result.data).map(obj), total: typeof total === 'number' && total >= 0 ? total : undefined };
}

const categoryName = (record: RecordData) => str(record.name_en) || str(record.name) || str(record.name_bn);
export async function loadCategoryTree(auth: Session) {
  const data = await api('/category', auth.token);
  function nodes(records: unknown, level: number): CategoryOption[] {
    return arr(records).map(obj).flatMap(record => {
      const id = str(record._id);
      const name = categoryName(record);
      return mongoId(id) && name ? [{ id, name, children: level < 3 ? nodes(record[categoryChildren[level]], level + 1) : [] }] : [];
    });
  }
  return nodes(Array.isArray(data) ? data : obj(data).data, 0);
}

export function productCategory(row: RecordData) {
  return categoryFields.flatMap(field => {
    const ref = obj(row[field]);
    const name = categoryName(ref);
    return name ? [name] : [];
  });
}

const nonNegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
export function basePricing(variants: RecordData[]) {
  const prices = variants.flatMap(variant => {
    const regular = nonNegative(variant.regular_price);
    const sale = nonNegative(variant.sale_price);
    const amount = sale && sale > 0 ? sale : regular;
    return amount !== undefined ? [{ amount, regular }] : [];
  });
  if (!prices.length) return;
  const min = Math.min(...prices.map(price => price.amount));
  const max = Math.max(...prices.map(price => price.amount));
  const regular = prices[0].regular;
  return { min, max, was: min === max && regular !== undefined && regular > min && prices.every(price => price.regular === regular) ? regular : undefined };
}

export function stockOverview(row: RecordData, variants: RecordData[], showLocations: boolean) {
  const quantities = variants.map(variant => variant.available_quantity)
    .filter((quantity): quantity is number => typeof quantity === 'number' && Number.isFinite(quantity));
  const units = quantities.reduce((total, quantity) => total + Math.max(0, quantity), 0);
  const locations = new Map<string, string>();
  if (showLocations && units > 0) for (const entry of arr(row.stocks).map(obj)) {
    if (!(typeof entry.available_quantity === 'number' && entry.available_quantity > 0)) continue;
    for (const location of (Array.isArray(entry.business_location) ? entry.business_location : [entry.business_location]).map(obj)) {
      const id = str(location._id);
      const name = str(location.name) || str(location.business_location_name);
      if (mongoId(id) && name) locations.set(id, name);
    }
  }
  return { units, known: quantities.length === variants.length && variants.length > 0, locations: [...new Set(locations.values())].sort() };
}
