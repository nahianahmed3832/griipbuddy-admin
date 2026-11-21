import 'server-only';
import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from './api';
import { loadLocations, reference, requireWrite } from './advanced';
import { param, type Query } from './data';
import { locationInRegion } from './operations';
import { dateLabel, posDay, posMoney, posPageSizes, posRangeDates, posRanges, posTimeZone, validPosDay, type PosItem, type PosRange, type PosRegisterRow } from './pos';
import { reportNumber } from './report-format';
import { has, superAdmin } from './sections';

const paymentNumbers = ['paid', 'discount', 'total', 'due'] as const;
const paymentKeys = ['paid_amount', 'total_discount', 'total_amount', 'due_amount'] as const;
export const allPosLimit = 10_000;
const first = (value: unknown) => obj(Array.isArray(value) ? value[0] : value);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function verifyPosScope(auth: Session, location: string) {
  if (!superAdmin(auth.staff) && auth.staff.assignedLocation && auth.staff.assignedLocation !== location) {
    throw new ApiError(403, 'This sale is outside your assigned business location.');
  }
}

export async function posRegisterFilters(q: Query, auth: Session) {
  if (!has(auth.staff, 'pos.view')) throw new ApiError(403);
  const locations = has(auth.staff, 'business_locations.view') ? await loadLocations(auth, 'BD') : [];
  const assigned = superAdmin(auth.staff) ? undefined : auth.staff.assignedLocation;
  const requested = param(q, 'businessLocation') || param(q, 'location') || '';
  if (assigned && requested && assigned !== requested) throw new ApiError(403);
  const location = assigned || requested;
  if (location && (!mongoId(location) || (location !== assigned && !locations.some(row => row.value === location)))) throw new ApiError(403);
  const today = posDay();
  const requestedRange = param(q, 'selectedOption') ?? param(q, 'range');
  const range = posRanges.find(option => option === requestedRange) ??
    (param(q, 'from') || param(q, 'to') ? 'Custom Range' : 'Today');
  const fromInput = param(q, 'from');
  const toInput = param(q, 'to');
  const [from, to] = posRangeDates(range as PosRange, today, fromInput, toInput);
  const creator = param(q, 'createdBy') || param(q, 'creator') || '';
  const canViewStaff = has(auth.staff, 'user.view');
  if (creator && (!canViewStaff || !mongoId(creator))) throw new ApiError(403);
  const serial = (param(q, 'saleSerialId') ?? param(q, 'serial') ?? '').trim().slice(0, 15);
  const size = posPageSizes.find(size => String(size) === param(q, 'size')) ?? 20;
  const page = size === 'all' ? 1 : Math.max(1, Math.min(100000, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const input = {
    region: 'BD', business_location_id: location, startDate: from, endDate: to, created_by: creator, sale_serial_id: serial,
  };
  return {
    input, page, size, range, from, to, serial, locations, assigned, location, creator, today,
    valid: from <= to && (!fromInput || validPosDay(fromInput)) && (!toInput || validPosDay(toInput)) && (!serial || /^\d{1,15}$/.test(serial)),
    canViewStaff, canSeeCost: has(auth.staff, 'purchase.price.view'), canSeeProfit: has(auth.staff, 'potential.profit.view'),
  };
}

export type PosRegisterFilters = Awaited<ReturnType<typeof posRegisterFilters>>;

function registerRow(row: RecordData, filters: PosRegisterFilters): PosRegisterRow {
  const items = arr(row.products).map(obj);
  const customer = first(row.user);
  const location = first(row.business_location);
  const creator = first(row.created_by);
  const date = new Date(str(row.sale_date));
  const dateText = Number.isNaN(date.getTime()) ? '-' : [
    new Intl.DateTimeFormat('en-GB', { timeZone: posTimeZone }).format(date),
    new Intl.DateTimeFormat('en-US', { timeZone: posTimeZone, hour: '2-digit', minute: '2-digit' }).format(date),
  ].join('\n');
  const serial = String(row.sale_serial_id ?? '');
  const amounts: PosRegisterRow['amounts'] = {};
  paymentNumbers.forEach((column, index) => { amounts[column] = number(row[paymentKeys[index]]); });
  if (filters.canSeeCost) amounts.cost = items.reduce((total, item) => total + number(item.total_cost), 0);
  if (filters.canSeeProfit) amounts.profit = number(row.profit);
  const moneyCells = Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, posMoney(value) + ' Tk']));
  return {
    id: str(row._id), serial, amounts, subtotal: number(row.sub_total ?? row.total_amount),
    cells: {
      date: dateText, invoice: [serial && '#' + serial, str(row.invoice_number)].filter(Boolean).join('\n'),
      customer: [str(customer.full_name) || 'Walk-in Customer', str(row.customer_phone)].filter(Boolean).join('\n'),
      location: str(location.name) || str(location.business_location_name) || '-', quantity: String(items.reduce((total, item) => total + number(item.quantity), 0)),
      sku: items.map(item => str(obj(item.selected_variant).sku) + ' (Qty ' + number(item.quantity) + ')').join('\n'),
      ...moneyCells, status: str(row.payment_status), method: str(row.payment_method), creator: str(creator.full_name) || '-',
      note: str(row.sale_note), paymentNote: str(row.payment_note),
    },
  };
}

export async function loadPosRegisterPage(auth: Session, filters: PosRegisterFilters, page: number, size: number) {
  if (!filters.valid) return { total: 0, rows: [] };
  const payload = obj(await api(url('/pos/sale', { ...filters.input, page: String(page), limit: String(size) }), auth.token));
  const sales = arr(payload.posSales).map(obj);
  return { total: number(obj(payload.meta).total), rows: sales.map(row => registerRow(row, filters)).filter(row => mongoId(row.id)) };
}

export async function loadPosRegister(auth: Session, filters: PosRegisterFilters) {
  if (filters.size !== 'all') return { ...await loadPosRegisterPage(auth, filters, filters.page, filters.size), tooMany: false };
  const pageSize = 250;
  const { total, rows } = await loadPosRegisterPage(auth, filters, 1, pageSize);
  if (total > allPosLimit) return { total, rows: [], tooMany: true };
  for (let page = 2; page <= Math.ceil(total / pageSize); page++) {
    const next = await loadPosRegisterPage(auth, filters, page, pageSize);
    rows.push(...next.rows);
  }
  return { total, rows, tooMany: false };
}

export async function readPosRegisterReport(auth: Session, filters: PosRegisterFilters) {
  return filters.valid ? obj(await api(url('/pos/admin/report', filters.input), auth.token)) : {};
}

export async function loadPosRegisterTotals(auth: Session, filters: PosRegisterFilters): Promise<Partial<Record<'sales' | 'profit' | 'cost' | 'discount' | 'due' | 'count', number>>> {
  if (!filters.valid) return {};
  const data = await readPosRegisterReport(auth, filters);
  const reportValue = (value: unknown) => reportNumber(value) ?? undefined;
  return {
    sales: reportValue(data.totalSales), discount: reportValue(data.totalDiscount), due: reportValue(data.totalDue),
    count: reportValue(data.numberOfSales), ...(filters.canSeeCost && { cost: reportValue(data.totalCost) }),
    ...(filters.canSeeProfit && { profit: reportValue(data.totalProfit) }),
  };
}

export async function posStaff(auth: Session) {
  const available = has(auth.staff, 'role.view') ? obj(await api('/roles?limit=250', auth.token)) : {};
  const roles = new Set(['SUPER_ADMIN', 'ADMIN', auth.staff.role, ...arr(available.roles).map(row => str(obj(row).role_name))]);
  roles.delete('USER');
  roles.delete('');
  const data = obj(await api(url('/user/admin/all/roles', { limit: '250', role: [...roles].join(',') }), auth.token));
  return arr(data.data).map(obj).filter(row => row.role !== 'USER' && mongoId(str(row._id)))
    .map(row => ({ id: str(row._id), name: str(row.full_name) }));
}

function stockItem(stock: RecordData): PosItem {
  const variant = obj(stock.variant);
  return {
    sku: str(variant.sku), name: str(obj(stock.product).name), regularPrice: number(variant.regular_price),
    attributes: Object.values(obj(variant.attribute_values)).map(str).filter(Boolean).join(' - '),
    salePrice: number(variant.sale_price), barcode: str(variant.barcode), available: number(stock.available_quantity),
  };
}

export async function searchPosItems(location: string, q: string, auth: Session, scan: boolean) {
  requireWrite(auth, 'pos.view', 'product.view', 'business_locations.view');
  if (!has(auth.staff, 'pos.create') && !has(auth.staff, 'pos.update')) throw new ApiError(403);
  verifyPosScope(auth, location);
  await locationInRegion(location, 'BD', auth);
  const stocks = obj(await api(url('/business-location/inventories/' + location, {
    ...(scan ? { sku: '^' + literal(q) + '$' } : { searchQuery: literal(q) }), limit: '20', minQty: '1',
  }), auth.token));
  let items = arr(stocks.data).map(obj).filter(stock => (str(obj(stock.product).region) || 'BD') === 'BD').map(stockItem);
  if (!scan && !items.length && /^[a-z0-9-]{2,100}$/i.test(q)) {
    const product = await api('/product/slug/' + q, auth.token).catch(error => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    const id = reference(product);
    if (mongoId(id) && (str(obj(product).region) || 'BD') === 'BD') {
      const bySlug = obj(await api(url('/business-location/inventories/' + location, { productId: id, limit: '20', minQty: '1' }), auth.token));
      items = arr(bySlug.data).map(obj).map(stockItem);
    }
  }
  if (scan && !items.length) {
    const barcode = obj(await api(url('/pos/scan', { barcode: q, business_location_id: location }), auth.token));
    if (stockItem(barcode).available) items = [stockItem(barcode)];
  }
  return items.filter(item => item.sku && item.regularPrice > 0);
}

export async function searchPosCustomers(q: string, auth: Session) {
  requireWrite(auth, 'pos.view', 'pos.create', 'user.view');
  if (!/^\d{3,16}$/.test(q)) return [];
  const data = arr(await api('/user/users/regx-phone/' + q, auth.token));
  return data.map(obj).filter(row => row.role === 'USER' && row.status === 'ACTIVE' && !row.isDeleted).slice(0, 15)
    .map(row => ({ name: str(row.full_name), phone: str(row.phone_number) }));
}

export async function readPosSale(id: string, auth: Session) {
  if (!mongoId(id) || !has(auth.staff, 'pos.view')) throw new ApiError(403);
  const sale = obj(await api('/pos/sale/' + id, auth.token));
  if (str(obj(sale.business_location).region) !== 'BD') throw new ApiError(404);
  verifyPosScope(auth, reference(sale.business_location));
  return sale;
}

export function posReturnDetails(sale: RecordData) {
  return {
    paid: number(sale.paid_amount), discountValue: number(obj(sale.overall_discount).value),
    discountType: str(obj(sale.overall_discount).type) || 'FLAT',
    lines: arr(sale.products).map(obj).map(line => {
      const variant = obj(line.selected_variant);
      return {
        barcode: str(variant.barcode), sku: str(variant.sku), attributes: Object.values(obj(variant.attribute_values)).map(str).filter(Boolean).join(' - '),
        quantity: number(line.quantity), regularPrice: number(variant.regular_price), salePrice: number(variant.sale_price),
      };
    }).filter(line => line.quantity > 0 && line.barcode),
  };
}

export type PosReturnDetails = ReturnType<typeof posReturnDetails>;

export async function changePosSale(id: string, action: unknown, payload: RecordData, auth: Session) {
  if (action !== 'delete' && action !== 'return') throw new ApiError(400, 'Unknown sale action.');
  requireWrite(auth, 'pos.view', action === 'delete' ? 'pos.delete' : 'pos.update');
  if (action === 'delete' && payload.confirmation !== 'DELETE') throw new ApiError(400, 'Type DELETE to confirm.');
  const sale = await readPosSale(id, auth);
  if (action === 'delete') return api('/pos/admin/sale/' + id, auth.token, { method: 'DELETE' });
  const existing = new Map(arr(sale.products).map(obj).map(line => [str(obj(line.selected_variant).barcode), line]));
  const requested = arr(payload.items).map(obj);
  if (!requested.length || requested.length > 20 || new Set(requested.map(line => line.barcode)).size !== requested.length) {
    throw new ApiError(400, 'Choose at least one item to return.');
  }
  const items = requested.map(line => {
    const barcode = str(line.barcode);
    const original = existing.get(barcode);
    const quantity = Number(line.quantity);
    if (!barcode || !original || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > number(original.quantity)) {
      throw new ApiError(400, 'Enter a return quantity within the available sale quantity.');
    }
    return { barcode, product: reference(original.product), quantity };
  });
  const discount = Number(payload.discount);
  const type = payload.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT';
  const paid = Number(payload.paid);
  if (!Number.isFinite(discount) || discount < 0 || discount > (type === 'PERCENTAGE' ? 100 : number(sale.sub_total)) ||
    !Number.isFinite(paid) || paid < 0 || paid > number(sale.paid_amount)) {
    throw new ApiError(400, 'Check the return discount and paid amount.');
  }
  return api('/pos/sale/return/' + id, auth.token, {
    method: 'PUT',
    body: JSON.stringify({
      business_location: reference(sale.business_location), items, overall_discount_override: { type, value: discount },
      paid_amount: paid, refund_method: str(sale.payment_method) || 'Cash', processed_by: auth.staff.id,
    }),
  });
}

export function posRegisterTitle(filters: PosRegisterFilters) {
  if (!filters.from) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: posTimeZone, weekday: 'short' });
  const shortDate = (day: string) => {
    const date = new Date(day);
    return weekday.format(date) + ' ' + dateLabel(day, true).replace(',', '');
  };
  return filters.from === filters.to ? shortDate(filters.from) : shortDate(filters.from) + ' to ' + shortDate(filters.to);
}
