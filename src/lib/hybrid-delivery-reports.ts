import { arr, mongoId, obj, str, type RecordData, type Session } from './api';
import { canReadHybridReports, loadHybridReportOrders, type HybridReportLine, type HybridReportOrder } from './hybrid-orders';
import {
  appendQuality, bookings, bucketKey, courierLate, courierOutcome, hoursSince, mergeHybridSalesReport, numeric, periodActivity,
  periodOf, placedOutcome, ratio, round, within,
} from './hybrid-reporting';
import type { Region } from './sections';

const mergedReports = ['sales-summary', 'sales-by-product', 'order-status', 'pending-fulfilment', 'returns-rts'];

export function canMergeHybridReport(id: string, auth: Session, region: Region, locations?: string) {
  return mergedReports.includes(id) && canReadHybridReports(auth, region, locations);
}

const array = (input: unknown) => arr(input).map(obj);
const sum = (rows: RecordData[], keys: string[]) => Object.fromEntries(keys.map(key => [key,
  round(rows.reduce((total, row) => total + numeric(row[key]), 0))]));
const rateTone = (value: number | null, warn: number, alert: number) => value == null ? undefined :
  value >= alert ? 'danger' : value >= warn ? 'warning' : 'success';
const localKey = (value: unknown) => str(value).trim().toLocaleLowerCase();
const replaceTable = (data: RecordData, id: string, update: (table: RecordData) => RecordData) =>
  ({ ...data, tables: array(data.tables).map(table => table.id === id ? update(table) : table) });

function updateMetrics(data: RecordData, values: Record<string, unknown>, extra?: (item: RecordData) => RecordData) {
  return { ...data, kpis: array(data.kpis).map(item => {
    const key = str(item.key);
    const patched = Object.hasOwn(values, key) ? { ...item, value: values[key] } : item;
    return extra ? extra(patched) : patched;
  }) };
}

const statusLabels: Record<string, string> = {
  PLACED: 'Placed', ACCEPTED: 'Accepted', PROCESSING: 'Paid, processing', IN_REVIEW: 'Booked with courier / outlet',
  HANDED_OVER_TO_COURIER: 'Handed to courier', IN_TRANSIT: 'In transit', RETURN_REQUESTED: 'Return requested', PENDING_RETURN: 'Coming back',
  INCOMPLETE: 'Unpaid / incomplete',
};

function orderStatus(data: RecordData, orders: HybridReportOrder[]) {
  const now = Date.now();
  const counts = ['placed', 'open', 'with_courier', 'delivered', 'returning', 'returned', 'cancelled'];
  const ageing = replaceTable(data, 'open', table => {
    const columns = ['orders', 'value', 'under1d', 'd1to2', 'd2to7', 'over7d'];
    const rows = array(table.rows).map(row => {
      const current = orders.filter(order => statusLabels[order.status] === row.status);
      if (!current.length) return row;
      const ages = current.map(order => hoursSince(order.statusAt, now));
      const ranges = [0, 24, 48, 168, Number.POSITIVE_INFINITY];
      const next = { ...row,
        orders: numeric(row.orders) + current.length,
        value: round(numeric(row.value) + current.reduce((total, order) => total + order.totalMinor, 0) / 100),
        oldestHours: Math.max(numeric(row.oldestHours), ...ages),
        ...Object.fromEntries(columns.slice(2).map((key, index) => [key, numeric(row[key]) +
          ages.filter(age => age >= ranges[index] && age < ranges[index + 1]).length])),
      };
      return { ...next, _tones: { ...obj(row._tones),
        ...(numeric(obj(next).over7d) && { over7d: 'danger' }),
        ...(numeric(obj(next).d2to7) && { d2to7: 'warning' }),
      } };
    });
    return { ...table, rows, totals: { ...obj(table.totals), ...sum(rows, columns) } };
  });
  const cohort = bookings(orders, periodOf(obj(data.meta)));
  const unit = str(obj(data.mergeInputs).unit);
  const outcome = array(ageing.tables).find(table => table.id === 'outcomes');
  if (!outcome || !unit) return ageing;
  const groups = new Map<string, HybridReportOrder[]>();
  for (const order of cohort) {
    const key = bucketKey(order.placedAt, unit);
    const current = groups.get(key) ?? [];
    current.push(order);
    groups.set(key, current);
  }
  const rates = (row: RecordData) => ({
    ...row, deliveredRate: ratio(numeric(row.delivered), numeric(row.placed)), cancelledRate: ratio(numeric(row.cancelled), numeric(row.placed)),
    rtsRate: ratio(numeric(row.returned) + numeric(row.returning), numeric(row.placed)),
  });
  const rows = array(outcome.rows).map(row => {
    const additional = groups.get(str(row.key));
    if (!additional?.length) return row;
    const next: RecordData = { ...row, placed: numeric(row.placed) + additional.length };
    for (const order of additional) {
      const key = placedOutcome(order);
      next[key] = numeric(next[key]) + 1;
    }
    const derived = rates(next);
    return { ...derived, _tones: { ...obj(row._tones), cancelledRate: rateTone(derived.cancelledRate, .05, .15), rtsRate: rateTone(derived.rtsRate, .1, .2) } };
  });
  const totals = rates({ ...obj(outcome.totals), ...sum(rows, counts) });
  const combined = replaceTable(ageing, 'outcomes', table => ({ ...table, rows, totals }));
  return updateMetrics(combined, { placed: obj(totals).placed, deliveredRate: totals.deliveredRate, cancelledRate: totals.cancelledRate,
    rtsRate: totals.rtsRate, open: numeric(obj(totals).open) + numeric(obj(totals).with_courier) },
  item => item.key === 'cancelledRate' ? { ...item, tone: rateTone(totals.cancelledRate, .05, .15) }
    : item.key === 'rtsRate' ? { ...item, tone: rateTone(totals.rtsRate, .1, .2) } : item);
}

function tradeLine(line: HybridReportLine): RecordData {
  return {
    product: line.name, sku: line.sku, category: line.category || 'Uncategorized', variantId: line.id,
    _links: mongoId(line.productId ?? '') ? { product: '/dashboard/product-details/' + line.productId } : undefined,
  };
}

function matchingLine(rows: RecordData[], line: HybridReportLine) {
  return rows.find(row => row.variantId === line.id) ?? rows.find(row => !str(row.variantId) && line.sku && localKey(row.sku) === localKey(line.sku));
}

function mergeLine(rows: RecordData[], line: HybridReportLine, values: Record<string, number>) {
  const row = matchingLine(rows, line) ?? tradeLine(line);
  if (!rows.includes(row)) rows.push(row);
  for (const [key, value] of Object.entries(values)) row[key] = round(numeric(row[key]) + value);
}

function returnsReport(data: RecordData, orders: HybridReportOrder[]) {
  const period = periodOf(obj(data.meta));
  const activity = periodActivity(orders, period);
  const dispatched = orders.filter(order => within(order.dispatchedAt, period));
  const districts = array(array(data.tables).find(table => table.id === 'districts')?.rows).map(row => ({ ...row }));
  const products = array(array(data.tables).find(table => table.id === 'products')?.rows).map(row => ({ ...row }));
  for (const order of dispatched) {
    const place = str(order.district).trim().replace(/\s+/g, ' ') || 'Unknown';
    const row = districts.find(item => localKey(item.district) === localKey(place)) ?? { district: place, dispatched: 0, delivered: 0, rts: 0, pending: 0 };
    if (!districts.includes(row)) districts.push(row);
    const outcome = courierOutcome(order);
    row.dispatched = numeric(row.dispatched) + 1;
    row[outcome] = numeric(row[outcome]) + 1;
    if (outcome === 'rts') for (const line of order.lines) mergeLine(products, line, { rtsUnits: line.quantity });
  }
  for (const receipt of activity.returns) {
    for (const line of receipt.lines) mergeLine(products, line, { customerUnits: line.quantity });
  }
  const counts = ['dispatched', 'delivered', 'rts', 'pending'];
  const native = obj(array(data.tables).find(table => table.id === 'districts')?.totals);
  const totals = sum(districts, counts);
  const rates = (row: RecordData) => ({ ...row, rtsRate: ratio(numeric(row.rts), numeric(row.delivered) + numeric(row.rts)) });
  const rtsRate = ratio(totals.rts, totals.delivered + totals.rts);
  const oldMetrics = array(data.kpis);
  const count = (key: string) => numeric(oldMetrics.find(metric => metric.key === key)?.value);
  const customerReturns = count('customerReturns') + new Set(activity.returns.map(item => item.orderId)).size;
  const deliveryCount = numeric(obj(data.mergeInputs).deliveredInPeriod) + activity.delivered.length;
  const customerReturnRate = ratio(customerReturns, deliveryCount);
  const missingRefund = activity.returns.some(item => item.confirmedMinor == null);
  const totalRefund = round(count('returnsValue') + activity.returns.reduce((value, item) => value + (item.confirmedMinor ?? item.estimateMinor), 0) / 100);
  const withDistrict = replaceTable(data, 'districts', table => ({ ...table,
    rows: districts.map(row => {
      const next = rates(row);
      return { ...next, _tones: { ...obj(row._tones), rtsRate: rateTone(next.rtsRate, .1, .2), ...(numeric(row.rts) && { rts: 'danger' }) } };
    }), totals: { ...native, ...rates(totals) },
  }));
  const withProducts = replaceTable(withDistrict, 'products', table => ({ ...table,
    rows: products.map(row => ({ ...row, customerUnits: numeric(row.customerUnits), rtsUnits: numeric(row.rtsUnits),
      totalUnits: numeric(row.customerUnits) + numeric(row.rtsUnits),
      _tones: { ...obj(row._tones), ...(numeric(row.rtsUnits) && { rtsUnits: 'danger' }), ...(numeric(row.customerUnits) && { customerUnits: 'warning' }) },
    })).sort((a, b) => b.totalUnits - a.totalUnits),
  }));
  return updateMetrics(withProducts, { dispatched: totals.dispatched, delivered: totals.delivered, rts: totals.rts, rtsRate,
    customerReturns, customerReturnRate, returnsValue: totalRefund },
  item => item.key === 'rtsRate' ? { ...item, tone: rateTone(rtsRate, .1, .2) }
    : item.key === 'customerReturnRate' ? { ...item, tone: rateTone(customerReturnRate, .05, .1) }
      : item.key === 'returnsValue' && missingRefund ? { ...item, estimated: 'Some returns have no confirmed refund. Their value is estimated from the returned items.' } : item);
}

function refundAllocations(receipt: ReturnType<typeof periodActivity>['returns'][number]) {
  if (receipt.confirmedMinor == null || !receipt.lines.length) return receipt.lines.map(line => line.amountMinor);
  const weights = receipt.estimateMinor ? receipt.lines.map(line => line.amountMinor) : receipt.lines.map(line => line.quantity);
  const total = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
  let prefix = BigInt(0);
  return weights.map(weight => {
    const previous = prefix / total;
    prefix += BigInt(weight) * BigInt(receipt.confirmedMinor!);
    return Number(prefix / total - previous);
  });
}

function salesByProduct(data: RecordData, orders: HybridReportOrder[]) {
  const activity = periodActivity(orders, periodOf(obj(data.meta)));
  const params = obj(data.params);
  const category = str(params.category);
  const search = localKey(params.search);
  const table = array(data.tables).find(table => table.id === 'products');
  if (!table) return data;
  const rows = array(table.rows).map(row => ({ ...row }));
  const accepted = (line: HybridReportLine) => (matchingLine(rows, line) || !category || line.categoryId === category) &&
    (!search || localKey(line.name).includes(search) || localKey(line.sku).includes(search) || matchingLine(rows, line));
  for (const order of activity.delivered) {
    for (const line of order.lines) if (accepted(line)) mergeLine(rows, line, { unitsDelivered: line.quantity, netSales: line.amountMinor / 100 });
  }
  for (const receipt of activity.returns) {
    const allocation = refundAllocations(receipt);
    receipt.lines.forEach((line, index) => {
      if (accepted(line)) mergeLine(rows, line, { unitsReturned: line.quantity, returnsValue: allocation[index] / 100 });
    });
  }
  const completed = rows.map(row => {
    const unitsDelivered = numeric(row.unitsDelivered);
    const netSales = numeric(row.netSales);
    const unitsReturned = numeric(row.unitsReturned);
    const returnsValue = numeric(row.returnsValue);
    const netAfterReturns = round(netSales - returnsValue);
    return { ...row, unitsDelivered, netSales, unitsReturned, returnsValue, netAfterReturns,
      avgPrice: unitsDelivered ? round(netSales / unitsDelivered) : null,
      _tones: { ...obj(row._tones), ...(unitsReturned && { unitsReturned: 'warning' }), ...(netAfterReturns < 0 && { netAfterReturns: 'danger' }) },
    };
  });
  const totals = sum(completed, ['unitsDelivered', 'netSales', 'unitsReturned', 'returnsValue', 'netAfterReturns', 'onHand']);
  const patched = replaceTable(data, 'products', table => ({ ...table, rows: completed, totals: { ...obj(table.totals), ...totals } }));
  return updateMetrics(patched, { unitsDelivered: totals.unitsDelivered, netSales: totals.netSales, unitsReturned: totals.unitsReturned,
    skus: completed.filter(row => row.unitsDelivered > 0).length }, item => item.key === 'unitsReturned'
      ? { ...item, tone: rateTone(ratio(totals.unitsReturned, totals.unitsDelivered), .05, .1) } : item);
}

function pendingFulfilment(data: RecordData, orders: HybridReportOrder[]) {
  const now = Date.now();
  const selected = str(obj(data.params).type);
  const additions = orders.flatMap(order => {
    const entry = order.awaitingPayment ? ['payment_proof', 'Payment to verify', 'violet', order.placedAt]
      : !order.dispatched && ['PLACED', 'PROCESSING'].includes(order.status) ? ['to_confirm', 'To confirm', 'info', order.placedAt]
        : courierLate(order, now) ? ['courier_overdue', 'Overdue with courier', 'danger', order.dispatchedAt!]
          : ['PENDING_RETURN', 'RETURN_REQUESTED'].includes(order.status) ? ['returns', 'Return to handle', 'warning', order.statusAt] : null;
    if (!entry) return [];
    const [type, typeLabel, tone, at] = entry;
    const waitingHours = hoursSince(Number(at), now);
    return [{ type, typeLabel, order: order.reference, placedAt: new Date(order.placedAt).toISOString(),
      status: statusLabels[order.status] ?? order.status, value: order.totalMinor / 100, cod: order.uncollectedCodMinor / 100,
      waitingHours, district: order.district, _links: { order: '/dashboard/order-details/' + order.id },
      _tones: { typeLabel: tone, waitingHours: waitingHours > 48 ? 'danger' : waitingHours > 24 ? 'warning' : undefined },
    }];
  });
  const combined = replaceTable(data, 'orders', table => ({ ...table, rows: [...array(table.rows), ...additions.filter(row => !selected || row.type === selected)] }));
  return updateMetrics(combined, Object.fromEntries(array(data.kpis).map(metric => [
    str(metric.key), numeric(metric.value) + additions.filter(order => order.type === metric.key).length,
  ])), item => ({ ...item, tone: numeric(item.value) ? item.key === 'courier_overdue' ? 'danger' : 'warning' : 'success' }));
}

function finalize(id: string, data: RecordData, exporting: boolean) {
  const { mergeInputs, ...result } = data;
  const page = numeric(obj(mergeInputs).page) || 1;
  const limit = numeric(obj(mergeInputs).limit) || 50;
  return { ...result, tables: array(data.tables).map(table => {
    const pagination = obj(table.pagination);
    const rows = array(table.rows);
    if (!table.pagination) return id === 'returns-rts' && table.id === 'products' && !exporting
      ? { ...table, rows: rows.slice(0, 20) } : { ...table, rows: rows.slice(0, 5000) };
    const sort = obj(table.sort);
    const column = array(table.columns).find(column => column.key === sort.key);
    const key = str(sort.key);
    const direction = sort.order === 'asc' ? 1 : -1;
    const kind = column?.type;
    const total = Math.max(rows.length, numeric(pagination.total));
    const ordered = [...rows].sort((left, right) => {
      const a = left[key], b = right[key];
      if (a == null || b == null) return a == null ? b == null ? 0 : 1 : -1;
      return direction * (typeof a === 'number' && typeof b === 'number' ? a - b
        : ['date', 'datetime'].includes(str(kind)) ? Date.parse(str(a)) - Date.parse(str(b))
        : String(a).localeCompare(String(b), 'en', { sensitivity: 'base' }));
    });
    return { ...table, rows: exporting ? ordered.slice(0, 5000) : ordered.slice((page - 1) * limit, page * limit),
      pagination: exporting ? null : { page, limit, total } };
  }) };
}

export async function reportWithHybrid(id: string, data: RecordData, auth: Session, region: Region, locations?: string, exporting = false): Promise<RecordData> {
  if (!canMergeHybridReport(id, auth, region, locations)) return data;
  const meta = obj(data.meta);
  const range = periodOf(meta);
  const hybrid = await loadHybridReportOrders(auth, region, {
    locations, from: periodOf(obj(meta.compare)).from || range.from, to: range.to,
    active: ['order-status', 'pending-fulfilment'].includes(id), milestones: true,
  });
  let combined = data;
  if (hybrid?.issue) combined = appendQuality(data, hybrid.issue);
  else if (obj(data.mergeInputs).limit && array(data.tables).some(table => numeric(obj(table.pagination).total) > array(table.rows).length)) {
    combined = appendQuality(data, 'Hybrid checkout cannot be reconciled when the native report exceeds its row limit.');
  } else if (hybrid?.orders.length) {
    const merger = { 'sales-summary': mergeHybridSalesReport, 'sales-by-product': salesByProduct,
      'order-status': orderStatus, 'pending-fulfilment': pendingFulfilment, 'returns-rts': returnsReport }[id];
    if (merger) combined = merger(data, hybrid.orders);
  }
  return obj(data.mergeInputs).limit ? finalize(id, combined, exporting) : combined;
}
