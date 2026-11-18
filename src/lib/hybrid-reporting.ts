import { arr, obj, str, type RecordData, type Session } from './api';
import { loadHybridReportOrders, type HybridReportData, type HybridReportOrder } from './hybrid-orders';
import type { Region } from './sections';

type Period = { from?: string; to?: string };
const dayFormat = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Dhaka' });
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const round = (value: number) => Math.round(value * 100) / 100;
const average = (amount: number, count: number) => count ? round(amount / count) : null;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayMs = 86_400_000;

export function comparisonStart(from?: string, to?: string, compare = true) {
  if (!from || !to || !compare) return from;
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? date(start - (end - start + dayMs)) : from;
}

function inPeriod(orders: HybridReportOrder[], period: Period) {
  return orders.filter(order => {
    const day = dayFormat.format(order.placedAt);
    return (!period.from || day >= period.from) && (!period.to || day <= period.to);
  });
}

function bookings(orders: HybridReportOrder[], period: Period) {
  return inPeriod(orders, period).filter(order => !['INCOMPLETE', 'FAILED'].includes(order.status));
}

function totals(orders: HybridReportOrder[]) {
  return orders.reduce(({ product, value, discount, units, cancelled }, order) => ({
    product: product + order.productMinor, value: value + order.totalMinor, discount: discount + order.discountMinor, units: units + order.units,
    cancelled: cancelled + Number(order.status === 'CANCELLED' && !order.dispatched),
  }), { product: 0, value: 0, discount: 0, units: 0, cancelled: 0 });
}

function buckets(orders: HybridReportOrder[], unit: string) {
  const result = new Map<string, { count: number; minor: number }>();
  for (const order of orders) {
    const day = dayFormat.format(order.placedAt);
    const at = new Date(day);
    const key = unit === 'month' ? day.slice(0, 7) : unit === 'week'
      ? date(at.getTime() - ((at.getUTCDay() + 1) % 7) * dayMs) : day;
    const prior = result.get(key) ?? { count: 0, minor: 0 };
    result.set(key, { count: prior.count + 1, minor: prior.minor + order.productMinor });
  }
  return result;
}

function mergeBookings(native: RecordData, orders: HybridReportOrder[]) {
  if (!orders.length) return native;
  const hybrid = totals(orders);
  const nativeCount = numeric(native.orders);
  const orderCount = nativeCount + orders.length;
  const productValue = round(numeric(native.productValue) + hybrid.product / 100);
  const cancelled = (typeof native.cancelledBeforeDispatch === 'number'
    ? native.cancelledBeforeDispatch : Math.round(numeric(native.cancellationRate) * nativeCount)) + hybrid.cancelled;
  return { ...native, orders: orderCount, orderValue: round(numeric(native.orderValue) + hybrid.value / 100),
    productValue, avgProductValue: average(productValue, orderCount), units: numeric(native.units) + hybrid.units,
    cancelledBeforeDispatch: cancelled, cancellationRate: cancelled / orderCount };
}

function appendQuality(data: RecordData, message: string): RecordData {
  return { ...data, quality: [...arr(data.quality), { code: 'HYBRID_CHECKOUT_SCOPE', message }] };
}

const periodOf = (meta: RecordData): Period => ({ from: str(meta.from) || undefined, to: str(meta.to) || undefined });

export function mergeHybridOverview(section: string, data: RecordData, hybrid: HybridReportData | null): RecordData {
  if (!hybrid) return data;
  if (hybrid.issue) return appendQuality(data, hybrid.issue);
  if (!hybrid.orders.length) return data;
  const orders = hybrid.orders;
  if (section === 'actions') {
    const native = obj(data.orders);
    const confirm = obj(native.toConfirm);
    const verify = obj(native.paymentsToVerify);
    const courier = obj(native.courier);
    const toConfirm = orders.filter(order => !order.dispatched && ['PLACED', 'PROCESSING'].includes(order.status));
    const toVerify = orders.filter(order => order.awaitingPayment);
    const ages = toConfirm.map(order => (Date.now() - order.placedAt) / 3_600_000);
    return appendQuality({ ...data, orders: {
      ...native,
      toConfirm: { ...confirm, orders: numeric(confirm.orders) + toConfirm.length, value: round(numeric(confirm.value) + totals(toConfirm).value / 100),
        oldestHours: ages.length ? Math.max(numeric(confirm.oldestHours), ...ages) : confirm.oldestHours,
        over24h: numeric(confirm.over24h) + ages.filter(age => age > 24).length,
        over48h: numeric(confirm.over48h) + ages.filter(age => age > 48).length },
      paymentsToVerify: { ...verify, orders: numeric(verify.orders) + toVerify.length,
        claimedAmount: round(numeric(verify.claimedAmount) + toVerify.reduce((sum, order) => sum + order.claimedMinor, 0) / 100) },
      courier: { ...courier, inTransit: numeric(courier.inTransit) + orders.filter(order => order.inTransit).length,
        pendingReturn: numeric(courier.pendingReturn) + orders.filter(order => order.status === 'PENDING_RETURN').length },
    } }, 'Hybrid checkout is included in order confirmation, payment review, parcels with a courier and pending returns. Overdue counts use legacy dispatch times.');
  }
  if (section === 'finance') {
    const cod = obj(data.codWithCourier);
    return { ...data, codWithCourier: { ...cod, orders: numeric(cod.orders) + orders.filter(order => order.inTransit).length,
      amount: round(numeric(cod.amount) + orders.reduce((sum, order) => sum + order.uncollectedCodMinor, 0) / 100) } };
  }
  const meta = obj(data.meta);
  const current = bookings(orders, periodOf(meta));
  if (section === 'fulfilment') {
    if (!current.length) return data;
    const funnel = { ...obj(data.funnel) };
    for (const order of current) {
      const outcome = ({ CANCELLED: 'cancelled', DELIVERED: 'delivered', PENDING_RETURN: 'returning', RETURNED: 'returned' } as Record<string, string>)[order.status]
        || (order.inTransit ? 'with_courier' : 'open');
      funnel[outcome] = numeric(funnel[outcome]) + 1;
    }
    funnel.total = numeric(funnel.total) + current.length;
    return appendQuality({ ...data, funnel }, 'The order outcome chart includes Hybrid checkout. Dispatch and delivery time measures use legacy milestone dates.');
  }
  if (section !== 'sales') return data;
  const previousMeta = obj(meta.compare);
  const previous = previousMeta.from ? bookings(orders, periodOf(previousMeta)) : [];
  if (!current.length && !previous.length) return data;
  const native = obj(data.bookings);
  const merged = mergeBookings(native, current);
  const source = arr(native.bySource).map(obj);
  const website = source.find(record => record.source === 'WEBSITE');
  const bySource = !current.length ? source : website ? source.map(record => record === website
    ? { ...record, orders: numeric(record.orders) + current.length } : record) : [...source, { source: 'WEBSITE', orders: current.length }];
  const series = obj(data.series);
  const groups = buckets(current, str(series.unit));
  return appendQuality({
    ...data,
    bookings: { ...merged, bySource, previous: native.previous ? mergeBookings(obj(native.previous), previous) : null },
    series: { ...series, points: arr(series.points).map(obj).map(point => {
      const checkout = groups.get(str(point.key));
      return checkout ? { ...point, ordersPlaced: numeric(point.ordersPlaced) + checkout.count,
        bookedValue: round(numeric(point.bookedValue) + checkout.minor / 100) } : point;
    }) },
  }, 'Placed totals and booked value include Hybrid checkout. Delivery, returns, categories and top products use the legacy records available for those measures.');
}

export function mergeHybridClassic(report: RecordData, hybrid: HybridReportData | null) {
  if (!hybrid || !hybrid.orders.length) return { report, note: hybrid?.issue };
  const hybridTotals = totals(hybrid.orders);
  const summary = obj(report.totals);
  const native = obj(summary.orders);
  const byDay = new Map<string, number>();
  for (const order of hybrid.orders) {
    const key = date(order.placedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + order.totalMinor);
  }
  return { report: { ...report, totals: { ...summary, orders: {
    ...native, count: numeric(native.count) + hybrid.orders.length, total_quantity: numeric(native.total_quantity) + hybridTotals.units,
    totalOrdersAmount: round(numeric(native.totalOrdersAmount) + hybridTotals.value / 100),
    totalOrdersDiscount: round(numeric(native.totalOrdersDiscount) + hybridTotals.discount / 100),
  } }, daily: arr(report.daily).map(obj).map(row => ({ ...row, orders: round(numeric(row.orders) + (byDay.get(str(row.date).slice(0, 10)) ?? 0) / 100) })) },
  note: 'Online order amount, discounts, quantity and count include Hybrid checkout. Due and profit figures use legacy records.' };
}

export async function salesReportWithHybrid(data: RecordData, auth: Session, region: Region, locations?: string): Promise<RecordData> {
  const meta = obj(data.meta);
  const period = periodOf(meta);
  if (!period.from || !period.to) return data;
  const hybrid = await loadHybridReportOrders(auth, region, {
    locations, from: periodOf(obj(meta.compare)).from || period.from, to: period.to,
  });
  return mergeHybridSalesReport(data, hybrid);
}

function mergeHybridSalesReport(data: RecordData, hybrid: HybridReportData | null) {
  if (!hybrid) return data;
  if (hybrid.issue) return appendQuality(data, hybrid.issue);
  const meta = obj(data.meta);
  const current = bookings(hybrid.orders, periodOf(meta));
  const previousMeta = obj(meta.compare);
  const previous = previousMeta.from ? bookings(hybrid.orders, periodOf(previousMeta)) : [];
  if (!current.length && !previous.length) return data;
  const currentTotals = totals(current);
  const priorTotals = totals(previous);
  const kpis = arr(data.kpis).map(obj);
  const placed = kpis.find(item => item.key === 'ordersPlaced');
  const revised = (item: RecordData, current: number, previous: number) => ({ ...item,
    value: round(numeric(item.value) + current),
    previous: typeof item.previous === 'number' ? round(item.previous + previous) : item.previous,
  });
  const series = obj(data.series);
  const groups = buckets(current, str(series.unit));
  const mergeRow = (row: RecordData) => {
    const checkout = groups.get(str(row.key));
    return checkout ? { ...row, ordersPlaced: numeric(row.ordersPlaced) + checkout.count,
      bookedValue: round(numeric(row.bookedValue) + checkout.minor / 100) } : row;
  };
  return appendQuality({
    ...data,
    kpis: kpis.map(item => {
      if (item.key === 'ordersPlaced') return revised(item, current.length, previous.length);
      if (item.key === 'bookedValue') return revised(item, currentTotals.product / 100, priorTotals.product / 100);
      if (item.key !== 'cancellationRate' || !placed) return item;
      const rate = (priorRate: unknown, count: number, add: number, cancelled: number) =>
        count + add ? (Math.round(numeric(priorRate) * count) + cancelled) / (count + add) : priorRate;
      const value = rate(item.value, numeric(placed.value), current.length, currentTotals.cancelled);
      return { ...item, value,
        previous: previousMeta.from ? rate(item.previous, numeric(placed.previous), previous.length, priorTotals.cancelled) : item.previous,
        tone: typeof value === 'number' ? value >= .15 ? 'danger' : value >= .05 ? 'warning' : 'success' : item.tone,
      };
    }),
    series: { ...series, points: arr(series.points).map(obj).map(mergeRow) },
    tables: arr(data.tables).map(obj).map(table => table.id !== 'periods' ? table : {
      ...table, rows: arr(table.rows).map(obj).map(mergeRow), totals: { ...obj(table.totals),
        ordersPlaced: numeric(obj(table.totals).ordersPlaced) + current.length,
        bookedValue: round(numeric(obj(table.totals).bookedValue) + currentTotals.product / 100) },
    }),
  }, 'Placed orders, booked value and cancellation rates include Hybrid checkout. Delivered sales and return values use legacy milestone and refund records.');
}
