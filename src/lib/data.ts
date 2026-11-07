import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from './api';
import { has, type Column, type Region, type Resource } from './sections';

export type Query = Record<string, string | string[] | undefined>;
export const param = (q: Query, key: string) => typeof q[key] === 'string' ? q[key] as string : undefined;

export function valueAt(record: unknown, path: string) {
  for (const option of path.split('|')) {
    const value = option.split('.').reduce<unknown>((result, part) => obj(result)[part], record);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

export function columnText(row: unknown, column: Column, currency?: string) {
  const value = valueAt(row, column.fields);
  if (column.label === 'Publication' && typeof value === 'boolean') return value ? 'Published' : 'Unpublished';
  return printable(value, column.kind, currency);
}

export function printable(value: unknown, kind?: Column['kind'], currency = 'BDT'): string {
  if (kind === 'count' && Array.isArray(value)) return String(value.length);
  if (kind === 'list' && Array.isArray(value)) return value.slice(0, 100).map(v => str(v) || str(obj(v).code) || str(obj(v).name)).filter(Boolean).join(', ');
  if (kind === 'list' && value && typeof value === 'object') {
    return Object.entries(obj(value)).filter(([key]) => /^[A-Z]{3}$/.test(key)).map(([code, price]) => {
      const fields = obj(price);
      const amounts = [fields.regular_price, fields.sale_price].filter(v => typeof v === 'number');
      return amounts.length ? code + ' ' + amounts.join(' / ') : '';
    }).filter(Boolean).join(' · ');
  }
  if (kind === 'money' && typeof value === 'number') {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value); }
    catch { return String(value); }
  }
  if (kind === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.slice(0, 320);
  return '';
}

export type ViewRow = { id: string; values: string[]; numeric?: (number | null)[]; href?: string; legacy?: string };

export function numericCells(record: RecordData, columns: Column[]) {
  return columns.map(column => {
    const value = valueAt(record, column.fields);
    if (Array.isArray(value) && column.kind === 'count') return value.length;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  });
}
export const perPage = 20;
export const dateParam = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : undefined;

export function permitted(resource: Resource, auth: Session) {
  return has(auth.staff, resource.permission)
    && (resource.flags !== 'pos-finance' || has(auth.staff, 'purchase.price.view') && has(auth.staff, 'potential.profit.view'))
    && (resource.legacy !== 'staffs' || has(auth.staff, 'role.view'));
}

const regexCharacters = /[.*+?^${}()|[\]\\]/g;
const regionFiltered = new Set(['/stocks','/product/admin/variants','/barcode','/business-location','/stocks/adjustment','/stocks/admin/transfer-history','/purchase','/assigned-orders','/pos/sale']);
function rowRegion(row: RecordData) {
  const declared = valueAt(row, 'region|product.region|business_location.region|current_location.region|from_business_location.region|from_location.region');
  return declared === 'INTERNATIONAL' ? 'INTERNATIONAL' : declared === 'BD' ? 'BD' : undefined;
}

export async function loadResource(resource: Resource, auth: Session, q: Query, region: Region) {
  if (!permitted(resource, auth)) throw new ApiError(403);
  const page = Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const rawSearch = (param(q, 'q') ?? '').trim().slice(0, 80);
  const search = rawSearch.replace(regexCharacters, '\\$&');
  const filter = param(q, 'filter');
  const params: Record<string, string | undefined> = {
    ...resource.params, page: String(page), limit: String(perPage),
    ...(resource.region ? { region } : {}),
  };
  if (resource.search && search) {
    const searchKey = resource.endpoint === '/product/admin/all' && param(q,'searchBy') === 'sku' ? 'sku' : resource.search;
    params[searchKey] = search;
  }
  if (resource.filter && filter && resource.filter.options.includes(filter)) params[resource.filter.key] = filter;
  if (resource.endpoint === '/order') {
    params.startDate = dateParam(param(q, 'from'));
    params.endDate = dateParam(param(q, 'to'));
  }
  if (resource.endpoint === '/stocks' || resource.endpoint === '/barcode') {
    const loc = param(q, 'location') ?? '';
    if (mongoId(loc)) params[resource.endpoint === '/stocks' ? 'businessLocationId' : 'business_location'] = loc;
  }
  if (resource.legacy === 'staffs') {
    const roles = arr(obj(await api('/roles?page=1&limit=100', auth.token)).roles)
      .map(r => str(obj(r).role_name)).filter(name => name && !name.includes(',') && name !== 'USER');
    if (!roles.length) return { rows: [], page, total: 0, hasNext: false, search: rawSearch };
    params.role = roles.join(',');
  }
  const data = await api(url(resource.endpoint, params), auth.token);
  const envelope = obj(data);
  let records = arr(Array.isArray(data) ? data : envelope[resource.rows ?? 'data']).map(obj);
  const initialLength = records.length;
  const enforceRegion = regionFiltered.has(resource.endpoint) && (!has(auth.staff, 'international.access') || resource.region);
  if (enforceRegion) {
    // For cross-market legacy lists that ignore the region query, expose only positively scoped rows.
    records = records.filter(row => rowRegion(row) === (resource.region ? region : 'BD'));
  }
  if (!resource.search && rawSearch) {
    const term = rawSearch.toLocaleLowerCase();
    records = records.filter(row => resource.columns.some(col => columnText(row, col).toLocaleLowerCase().includes(term)));
  }
  const count = obj(envelope.meta).total;
  return { rows: records, page, total: !enforceRegion && typeof count === 'number' ? count : undefined,
    hasNext: typeof count === 'number' ? page * perPage < count : initialLength === perPage, search: rawSearch };
}

export const reportIds = ['sales-summary','sales-by-product','order-status','pending-fulfilment','returns-rts','stock-valuation',
  'low-stock','stock-movements','inventory-aging','data-health'];
export const reportFilterKeys = ['groupBy', 'category', 'search', 'stock', 'type', 'status', 'show'];

export function reportQuery(q: Query, region: Region) {
  return { region, from: dateParam(param(q, 'from')), to: dateParam(param(q, 'to')),
    compare: param(q, 'compare') === 'none' ? 'none' : undefined,
    locations: (param(q, 'locations') ?? '').split(',').filter(mongoId).slice(0, 20).join(',') || undefined,
    ...Object.fromEntries(reportFilterKeys.map(key => [key, param(q, key)?.trim().slice(0, 100) || undefined])) };
}
