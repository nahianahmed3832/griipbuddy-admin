import { api, ApiError, arr, mongoId, obj, str, url, type Session } from './api';
import { dateParam, param, perPage, type Query } from './data';
import { canOperate } from './operations';
import { has, type Region } from './sections';

export const purchasePath = '/desk/inventory/purchases';
export const ratesPath = '/desk/inventory/rates';
export const rateFormPath = ratesPath + '/new';
export const purchaseStatuses = ['draft', 'ordered', 'received', 'cancelled'];
export const maxRateLines = 30;
export type RateOption = { id: string; name: string; sku: string; cost: string; discount: string; tax: string };

export function purchasePage(q: Query) {
  return Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
}

export function purchaseFilters(q: Query) {
  const supplier = param(q, 'supplier') ?? '';
  const location = param(q, 'business_location') ?? '';
  const status = param(q, 'status') ?? '';
  const number = param(q, 'purchase_number') ?? '';
  return {
    supplier: mongoId(supplier) ? supplier : undefined,
    business_location: mongoId(location) ? location : undefined,
    status: purchaseStatuses.includes(status) ? status : undefined,
    purchase_number: /^\d{1,12}$/.test(number) ? number : undefined,
    purchase_date_start: dateParam(param(q, 'purchase_date_start')),
    purchase_date_end: dateParam(param(q, 'purchase_date_end')),
  };
}

export async function purchaseList(auth: Session, region: Region, q: Query) {
  if (!has(auth.staff, 'purchase.view')) throw new ApiError(403);
  const filters = purchaseFilters(q);
  const page = purchasePage(q);
  const data = obj(await api(url('/purchase', {
    ...filters, region, page: String(page), limit: String(perPage), sortBy: 'purchase_date',
  }), auth.token));
  const rows = arr(data.data).map(obj).filter(row => obj(row.business_location).region === region);
  return { rows, page, filters, total: Number(obj(data.meta).total) || 0 };
}

export async function purchaseRecord(auth: Session, region: Region, id: string) {
  if (!has(auth.staff, 'purchase.view')) throw new ApiError(403);
  if (!mongoId(id)) throw new ApiError(404);
  const row = obj(await api('/purchase/' + id, auth.token));
  if (!row._id || obj(row.business_location).region !== region) throw new ApiError(404);
  return row;
}

export async function suppliers(auth: Session) {
  if (!has(auth.staff, 'supplier.view')) return [];
  return arr(await api('/supplier', auth.token)).map(obj).filter(row => mongoId(str(row._id)) && row.is_deleted !== true)
    .map(row => ({ value: str(row._id), label: str(row.name) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function rateOptions(auth: Session, region: Region, term: string): Promise<RateOption[]> {
  if (!canOperate(auth.staff, 'purchase-rate')) throw new ApiError(403);
  const searchQuery = term.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (searchQuery.length < 2) return [];
  const data = obj(await api(url('/product/admin/variants', { region, searchQuery, limit: '10' }), auth.token));
  return Promise.all(arr(data.data).map(obj).filter(row => mongoId(str(row._id))).map(async row => {
    const id = str(row._id);
    const defaults = obj(await api(url('/purchase/default/all', { variant: id, limit: '1' }), auth.token));
    const rate = obj(arr(defaults.data)[0]);
    const product = str(obj(row.product).name) || 'Unnamed product';
    const attributes = Object.values(obj(row.attribute_values)).map(str).filter(Boolean);
    return {
      id, name: attributes.length ? product + ' (' + attributes.join(', ') + ')' : product, sku: str(row.sku),
      cost: typeof rate.unit_cost === 'number' ? String(rate.unit_cost) : '',
      discount: String(rate.discount ?? 0), tax: String(rate.tax ?? 0),
    };
  }));
}
