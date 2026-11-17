import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from './api';
import { loadLocations } from './advanced';
import { param, type Query } from './data';
import { has, type Region } from './sections';

import { stockSorts, stockPageSizes, type ProductionStockFilters } from './production-stock-query';

type Location = { value: string; label: string };
export type StockViewRow = {
  id: string; title: string; sku: string; cost: number | null; price: number; quantity: number;
  locations: { id: string; label: string; quantity: number }[]; sold: number; profit: number | null;
};
export type StockSummary = {
  products: number; quantity: number; cost: number | null; sale: number; profit: number | null; sold: number;
  categories: { name: string; quantity: number; sold: number; cost: number | null; sale: number }[];
  subcategories: { name: string; quantity: number; sold: number; cost: number | null; sale: number }[];
};
const stockListEndpoint = '/business-location/stock/all';
const stockSummaryEndpoint = '/business-location/stock/category/subcategory';
const maxExportRows = 10000;

export function productionStockFilters(q: Query, region: Region): ProductionStockFilters {
  const rawLocations = param(q, 'businessLocation') ?? param(q, 'location');
  const businessLocation = rawLocations === 'all' ? rawLocations
    : rawLocations?.split(',').filter(mongoId).slice(0, 250).join(',') || undefined;
  const sortBy = param(q, 'sortBy');
  const product = param(q, 'product') ?? '';
  return {
    region, businessLocation, product: mongoId(product) ? product : undefined, skuQuery: param(q, 'skuQuery')?.trim().slice(0, 100) || undefined,
    searchQuery: (param(q, 'searchQuery') ?? param(q, 'q'))?.trim().slice(0, 100) || undefined,
    sortBy: sortBy && stockSorts.some(([id]) => id === sortBy) ? sortBy : 'available_quantity',
    sortOrder: param(q, 'sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown) => finite(value) ?? 0;
const locationName = (value: unknown) => str(obj(value).name) || str(obj(value).business_location_name);
const variation = (value: unknown) => Object.values(obj(value)).filter(item => typeof item === 'string' || typeof item === 'number').join('-');

export function stockPermissions(auth: Session) {
  return { cost: has(auth.staff, 'purchase.price.view'), profit: has(auth.staff, 'potential.profit.view') };
}

function stockRow(value: unknown, permission: ReturnType<typeof stockPermissions>): StockViewRow {
  const item = obj(value);
  const name = str(obj(item.product).name);
  const attributes = variation(item.attribute_values);
  return {
    id: str(item._id), title: attributes ? `${name} (${attributes})` : name, sku: str(item.sku),
    cost: permission.cost ? finite(item.avg_purchase_price) : null, price: count(item.sale_price),
    quantity: count(item.available_quantity), sold: count(item.total_sold),
    profit: permission.profit ? finite(item.potential_profit) : null,
    locations: arr(item.stocks_by_location).map(obj).map(raw => {
      const location = obj(raw.location);
      return { id: str(location._id) || str(raw.business_location) || str(raw._id), label: locationName(raw.location), quantity: count(raw.available_quantity) };
    }),
  };
}

function stockSummary(result: unknown, permission: ReturnType<typeof stockPermissions>): StockSummary {
  const payload = obj(result);
  const wrapped = obj(payload.data);
  const summary = obj(wrapped.summation ?? payload.summation);
  const group = (values: unknown) => arr(values).map(obj).map(group => ({
    name: group.name === null ? 'null' : str(group.name) || 'Uncategorized',
    quantity: count(group.total_available_quantity), sold: count(group.total_sold),
    cost: permission.cost ? finite(group.total_current_stock_purchase_value) : null,
    sale: count(group.total_sale_value),
  }));
  return {
    products: count(summary.total_products), quantity: count(summary.total_available_quantity),
    cost: permission.cost ? finite(summary.total_current_stock_purchase_value) : null,
    sale: count(summary.total_sale_value), profit: permission.profit ? finite(summary.total_potential_profit) : null,
    sold: count(summary.total_sold_value), categories: group(summary.summary_by_category), subcategories: group(summary.summary_by_subcategory),
  };
}

export async function loadProductionStock(auth: Session, region: Region, q: Query, exporting = false) {
  if (!has(auth.staff, 'stock.view')) throw new ApiError(403);
  const filters = productionStockFilters(q, region);
  const permissions = stockPermissions(auth);
  const locations = await loadLocations(auth, region);
  const active = Boolean(filters.businessLocation || filters.product || filters.skuQuery || filters.searchQuery);
  const selected = filters.businessLocation && filters.businessLocation !== 'all' ? filters.businessLocation.split(',') : [];
  const allowed = selectLocations(locations, selected);
  const requestedLimit = param(q, 'limit') ?? '20';
  const size = stockPageSizes.includes(requestedLimit) ? requestedLimit : '20';
  const page = size === 'all' || exporting ? 1 : Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  let rows: StockViewRow[] = [];
  let total = 0;
  let summary: StockSummary | undefined;
  if (active && allowed.length) {
    const limit = size === 'all' || exporting ? maxExportRows : Number(size);
    const query = {
      region, page: String(page), limit: String(limit), businessLocationIds: allowed.join(','),
      productId: filters.product, q: filters.searchQuery, sku: filters.skuQuery, sortBy: filters.sortBy, sortOrder: filters.sortOrder,
    };
    const [raw, totals] = await Promise.all([
      api(url(stockListEndpoint, query), auth.token).then(obj),
      api(url(stockSummaryEndpoint, { ...query, limit: '20', page: '1' }), auth.token),
    ]);
    total = count(obj(raw.meta).total);
    rows = arr(raw.data).map(value => stockRow(value, permissions));
    summary = stockSummary(totals, permissions);
  }
  return { active, filters, permissions, locations, selected, page, size, total, rows, summary };
}

function selectLocations(locations: Location[], selected: string[]) {
  const ids = locations.map(location => location.value);
  // A supplied selection may only narrow the current market. Never send an
  // empty location list to the legacy endpoint, which would search every market.
  return selected.length ? ids.filter(id => selected.includes(id)) : ids;
}

export async function loadProductionStockDetail(auth: Session, region: Region, id: string, locations: Location[]) {
  if (!has(auth.staff, 'stock.view') || !mongoId(id) || !locations.length) throw new ApiError(404);
  const allowed = locations.map(location => location.value);
  const result = obj(await api(url(stockListEndpoint, { businessLocationIds: allowed.join(','), variantId: id, limit: '1' }), auth.token));
  if (!arr(result.data).some(item => str(obj(item)._id) === id)) throw new ApiError(404);
  const data = obj(await api(url('/stocks/variant/' + id, { stockMovementsLimit: '1000' }), auth.token));
  const product = obj(data.product);
  if (!str(product.name) || (str(product.region) || 'BD') !== region) throw new ApiError(404);
  const locationMatches = (value: unknown) => allowed.includes(str(obj(value)._id) || str(value));
  const list = (value: unknown) => arr(value).map(obj);
  return {
    product, variant: obj(data.variant),
    stocks: list(data.stocks_by_location).filter(item => locationMatches(item.location)),
    movements: list(obj(data.stock_movements).data).filter(item => locationMatches(item.business_location)),
    siblings: list(data.sibling_variants),
  };
}

export function stockValue(price: number | null, quantity: number) {
  return price === null ? null : Math.round(price * quantity);
}

export function stockCurrency(value: unknown) {
  const safe = finite(value);
  return safe === null ? '—' : Math.round(safe).toLocaleString('en') + ' Tk';
}

export function stockReference(value: RecordData) { return variation(value.attribute_values); }
