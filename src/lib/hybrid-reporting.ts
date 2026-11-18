import { arr, obj, str, type RecordData } from './api';
import type { HybridReportData, HybridReportOrder } from './hybrid-orders';

export type Period = { from?: string; to?: string };
const dayFormat = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Dhaka' });
export const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
export const round = (value: number) => Math.round(value * 100) / 100;
const average = (amount: number, count: number) => count ? round(amount / count) : null;
export const ratio = (count: number, total: number) => total ? count / total : null;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayMs = 86_400_000;

export function comparisonStart(from?: string, to?: string, compare = true) {
  if (!from || !to || !compare) return from;
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? date(start - (end - start + dayMs)) : from;
}

export function trailingStart(days: number) {
  return date(Date.parse(dayFormat.format(Date.now())) - (days - 1) * dayMs);
}

export function within(at: number | undefined, period: Period) {
  if (at == null) return false;
  const day = dayFormat.format(at);
  return (!period.from || day >= period.from) && (!period.to || day <= period.to);
}

export function bookings(orders: HybridReportOrder[], period: Period) {
  return orders.filter(order => within(order.placedAt, period) && !['INCOMPLETE', 'FAILED'].includes(order.status));
}

function totals(orders: HybridReportOrder[]) {
  return orders.reduce(({ product, value, discount, units, cancelled, delivery }, order) => ({
    product: product + order.productMinor, value: value + order.totalMinor, discount: discount + order.discountMinor, units: units + order.units,
    cancelled: cancelled + Number(order.status === 'CANCELLED' && !order.dispatched), delivery: delivery + order.deliveryMinor,
  }), { product: 0, value: 0, discount: 0, units: 0, cancelled: 0, delivery: 0 });
}

export function bucketKey(time: number, unit: string) {
  const day = dayFormat.format(time);
  return unit === 'month' ? day.slice(0, 7) : unit === 'week'
    ? date(Date.parse(day) - ((new Date(day).getUTCDay() + 1) % 7) * dayMs) : day;
}

export function periodActivity(orders: HybridReportOrder[], period: Period) {
  const delivered = orders.filter(order => within(order.deliveredAt, period));
  const returns = orders.flatMap(order => order.returns
    .filter(receipt => order.wasDelivered && (order.deliveredAt == null || order.deliveredAt <= receipt.receivedAt) && within(receipt.receivedAt, period))
    .map(receipt => ({ ...receipt, orderId: order.id })));
  return { booked: bookings(orders, period), delivered, returns };
}

type Activity = ReturnType<typeof periodActivity>;

function activityTotals(activity: Activity) {
  const delivered = totals(activity.delivered);
  return {
    ordersPlaced: activity.booked.length, bookedValue: totals(activity.booked).product / 100,
    deliveredOrders: activity.delivered.length, deliveredValue: delivered.product / 100,
    deliveryIncome: delivered.delivery / 100, unitsDelivered: delivered.units,
    returnsCount: new Set(activity.returns.map(receipt => receipt.orderId)).size,
    returnsValue: activity.returns.reduce((sum, receipt) => sum + (receipt.confirmedMinor ?? receipt.estimateMinor), 0) / 100,
    estimatedValues: new Set(activity.returns.filter(receipt => receipt.confirmedMinor == null).map(receipt => receipt.orderId)).size,
  };
}

function activityBuckets(activity: Activity, unit: string) {
  const values = new Map<string, Activity>();
  const entry = (key: string) => {
    const existing = values.get(key);
    if (existing) return existing;
    const empty: Activity = { booked: [], delivered: [], returns: [] };
    values.set(key, empty);
    return empty;
  };
  for (const order of activity.booked) entry(bucketKey(order.placedAt, unit)).booked.push(order);
  for (const order of activity.delivered) entry(bucketKey(order.deliveredAt!, unit)).delivered.push(order);
  for (const receipt of activity.returns) entry(bucketKey(receipt.receivedAt, unit)).returns.push(receipt);
  return new Map([...values.entries()].map(([key, result]) => [key, activityTotals(result)]));
}

export function placedOutcome(order: HybridReportOrder) {
  if (order.wasDelivered) return 'delivered';
  if (order.status === 'RETURNED' || order.status === 'CANCELLED' && order.dispatched) return 'returned';
  if (order.status === 'PENDING_RETURN') return 'returning';
  if (order.status === 'CANCELLED') return 'cancelled';
  return order.dispatched ? 'with_courier' : 'open';
}

export function courierOutcome(order: HybridReportOrder) {
  if (order.wasDelivered) return 'delivered';
  return order.status === 'RETURNED' || order.status === 'CANCELLED' ? 'rts' : 'pending';
}

export const hoursSince = (time: number, now: number) => Math.max(0, (now - time) / 3_600_000);
export const courierLate = (order: HybridReportOrder, now: number) => order.inTransit && order.dispatchedAt !== undefined &&
  hoursSince(order.dispatchedAt, now) > (/dhaka|ঢাকা/i.test(order.district) ? 72 : 120);

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

export function appendQuality(data: RecordData, message: string, code = 'HYBRID_CHECKOUT_SCOPE'): RecordData {
  return { ...data, quality: [...arr(data.quality), { code, message }] };
}

export const periodOf = (meta: RecordData): Period => ({ from: str(meta.from) || undefined, to: str(meta.to) || undefined });

function mergeDelivered(native: RecordData, hybrid: ReturnType<typeof activityTotals>) {
  if (!hybrid.deliveredOrders) return native;
  const orders = numeric(native.orders) + hybrid.deliveredOrders;
  const productValue = round(numeric(native.productValue) + hybrid.deliveredValue);
  return { ...native, orders, productValue, avgOrderValue: average(productValue, orders),
    deliveryIncome: round(numeric(native.deliveryIncome) + hybrid.deliveryIncome), units: numeric(native.units) + hybrid.unitsDelivered };
}

function mergeDurations(native: RecordData, additions: number[], baseCount: number, medianKey: string, p90Key: string) {
  const { durations: raw, ...base } = native;
  if (!additions.length) return { record: base, complete: true };
  if (!Array.isArray(raw) && baseCount) return { record: base, complete: false };
  const samples = [...arr(raw).map(numeric), ...additions].sort((left, right) => left - right);
  const percentile = (p: number) => Math.round(samples[Math.ceil(p * samples.length) - 1] * 10) / 10;
  return { record: { ...base, [medianKey]: percentile(.5), [p90Key]: percentile(.9) }, complete: true };
}

function mergeFulfilment(data: RecordData, orders: HybridReportOrder[], current: Activity, prior: Period, compared: boolean) {
  const period = periodOf(obj(data.meta));
  const funnel = { ...obj(data.funnel) };
  for (const order of current.booked) {
    const outcome = placedOutcome(order);
    funnel[outcome] = numeric(funnel[outcome]) + 1;
  }
  funnel.total = numeric(funnel.total) + current.booked.length;
  const applyDispatch = (native: RecordData, range: Period) => {
    const dispatched = orders.filter(order => within(order.dispatchedAt, range));
    const measured = dispatched.filter(order => order.dispatchedAt! >= order.placedAt)
      .map(order => hoursSince(order.placedAt, order.dispatchedAt!));
    const merged = mergeDurations(native, measured, numeric(native.orders), 'medianHours', 'p90Hours');
    return { complete: merged.complete, record: { ...merged.record, orders: numeric(native.orders) + dispatched.length } };
  };
  const nativeDispatch = obj(data.dispatch);
  const dispatch = applyDispatch(nativeDispatch, period);
  const previous = compared && nativeDispatch.previous ? applyDispatch(obj(nativeDispatch.previous), prior) : null;
  const nativeTime = obj(data.deliveryTime);
  const measured = current.delivered.filter(order => order.dispatchedAt != null && order.deliveredAt! >= order.dispatchedAt)
    .map(order => hoursSince(order.dispatchedAt!, order.deliveredAt!) / 24);
  const time = mergeDurations(nativeTime, measured, numeric(nativeTime.measured), 'medianDays', 'p90Days');
  const nativeSuccess = obj(data.deliverySuccess);
  const windowDays = numeric(nativeSuccess.windowDays) || 30;
  const recent = orders.filter(order => within(order.dispatchedAt, { from: trailingStart(windowDays), to: dayFormat.format(Date.now()) }));
  const count = (outcome: string) => recent.filter(order => courierOutcome(order) === outcome).length;
  const delivered = numeric(nativeSuccess.delivered) + count('delivered');
  const returnedToSender = numeric(nativeSuccess.returnedToSender) + count('rts');
  const pending = numeric(nativeSuccess.pending) + count('pending');
  const results = { ...data, funnel, dispatch: { ...dispatch.record, previous: previous?.record ?? null },
    deliveryTime: { ...time.record, measured: numeric(nativeTime.measured) + (time.complete ? measured.length : 0),
      missing: numeric(nativeTime.missing) + current.delivered.length - measured.length },
    deliverySuccess: { ...nativeSuccess, windowDays, delivered, returnedToSender, pending,
      successRate: ratio(delivered, delivered + returnedToSender), rtsRate: ratio(returnedToSender, delivered + returnedToSender) },
  };
  return dispatch.complete && (previous?.complete ?? true) && time.complete ? results
    : appendQuality(results, 'The native timing sample exceeded its reporting limit. Timing percentiles shown cover legacy orders.');
}

function addSeriesActivity(row: RecordData, extra: ReturnType<typeof activityTotals> | undefined) {
  if (!extra) return row;
  return { ...row, ordersPlaced: numeric(row.ordersPlaced) + extra.ordersPlaced,
    bookedValue: round(numeric(row.bookedValue) + extra.bookedValue),
    deliveredOrders: numeric(row.deliveredOrders) + extra.deliveredOrders,
    deliveredValue: round(numeric(row.deliveredValue) + extra.deliveredValue) };
}

function noteMissingDeliveryDates(data: RecordData, orders: HybridReportOrder[]) {
  return orders.some(order => order.wasDelivered && order.deliveredAt == null)
    ? appendQuality(data, 'Some Hybrid deliveries have no recorded delivery time and are excluded from dated delivery figures.', 'HYBRID_DELIVERED_DATE_UNRECORDED')
    : data;
}

export function mergeHybridOverview(section: string, data: RecordData, hybrid: HybridReportData | null): RecordData {
  if (!hybrid) return data;
  if (hybrid.issue) return appendQuality(data, hybrid.issue);
  const orders = hybrid.orders;
  if (section === 'actions') {
    const native = obj(data.orders);
    const confirm = obj(native.toConfirm);
    const verify = obj(native.paymentsToVerify);
    const courier = obj(native.courier);
    const now = Date.now();
    const toConfirm = orders.filter(order => !order.dispatched && ['PLACED', 'PROCESSING'].includes(order.status));
    const toVerify = orders.filter(order => order.awaitingPayment);
    const overdue = orders.filter(order => courierLate(order, now));
    const ages = toConfirm.map(order => hoursSince(order.placedAt, now));
    return { ...data, orders: { ...native,
      toConfirm: { ...confirm, orders: numeric(confirm.orders) + toConfirm.length, value: round(numeric(confirm.value) + totals(toConfirm).value / 100),
        oldestHours: ages.length ? Math.max(numeric(confirm.oldestHours), ...ages) : confirm.oldestHours,
        over24h: numeric(confirm.over24h) + ages.filter(age => age > 24).length,
        over48h: numeric(confirm.over48h) + ages.filter(age => age > 48).length },
      paymentsToVerify: { ...verify, orders: numeric(verify.orders) + toVerify.length,
        claimedAmount: round(numeric(verify.claimedAmount) + toVerify.reduce((sum, order) => sum + order.claimedMinor, 0) / 100) },
      courier: { ...courier, inTransit: numeric(courier.inTransit) + orders.filter(order => order.inTransit).length,
        overdue: numeric(courier.overdue) + overdue.length,
        overdueCod: round(numeric(courier.overdueCod) + overdue.reduce((sum, order) => sum + order.uncollectedCodMinor, 0) / 100),
        returnRequested: numeric(courier.returnRequested) + orders.filter(order => order.status === 'RETURN_REQUESTED').length,
        pendingReturn: numeric(courier.pendingReturn) + orders.filter(order => order.status === 'PENDING_RETURN').length },
    } };
  }
  if (section === 'finance') {
    const cod = obj(data.codWithCourier);
    return { ...data, codWithCourier: { ...cod, orders: numeric(cod.orders) + orders.filter(order => order.inTransit).length,
      amount: round(numeric(cod.amount) + orders.reduce((sum, order) => sum + order.uncollectedCodMinor, 0) / 100) } };
  }
  const meta = obj(data.meta);
  const current = periodActivity(orders, periodOf(meta));
  const previousMeta = obj(meta.compare);
  const previous = previousMeta.from ? periodActivity(orders, periodOf(previousMeta)) : periodActivity([], {});
  if (section === 'fulfilment') return noteMissingDeliveryDates(mergeFulfilment(data, orders, current, periodOf(previousMeta), !!previousMeta.from), orders);
  if (section !== 'sales') return data;
  if (![...current.booked, ...current.delivered, ...current.returns, ...previous.booked, ...previous.delivered].length) {
    return noteMissingDeliveryDates(data, orders);
  }
  const native = obj(data.bookings);
  const merged = mergeBookings(native, current.booked);
  const source = arr(native.bySource).map(obj);
  const website = source.find(record => record.source === 'WEBSITE');
  const bySource = !current.booked.length ? source : website ? source.map(record => record === website
    ? { ...record, orders: numeric(record.orders) + current.booked.length } : record) : [...source, { source: 'WEBSITE', orders: current.booked.length }];
  const series = obj(data.series);
  const groups = activityBuckets(current, str(series.unit));
  const currentTotals = activityTotals(current);
  const priorTotals = activityTotals(previous);
  const delivered = obj(data.delivered);
  const returns = obj(data.returns);
  return noteMissingDeliveryDates({
    ...data,
    bookings: { ...merged, bySource, previous: native.previous ? mergeBookings(obj(native.previous), previous.booked) : null },
    delivered: { ...mergeDelivered(delivered, currentTotals),
      previous: delivered.previous ? mergeDelivered(obj(delivered.previous), priorTotals) : null },
    returns: { ...returns, orders: numeric(returns.orders) + currentTotals.returnsCount,
      value: round(numeric(returns.value) + currentTotals.returnsValue), estimatedValues: numeric(returns.estimatedValues) + currentTotals.estimatedValues },
    series: { ...series, points: arr(series.points).map(obj).map(point => addSeriesActivity(point, groups.get(str(point.key)))) },
  }, orders);
}

function hybridOrderMargin(order: HybridReportOrder) {
  if (order.status === 'CANCELLED' || (!order.wasDelivered && ['RETURNED', 'PENDING_RETURN'].includes(order.status))) return 0;
  if (!order.dispatched || order.purchaseCostMinor == null) return undefined;
  let margin = order.totalMinor - order.purchaseCostMinor;
  for (const receipt of order.returns) {
    if (order.deliveredAt != null && receipt.receivedAt < order.deliveredAt) continue;
    const recoveredCost = receipt.disposition === 'HOLD' ? 0 : receipt.returnedCostMinor;
    if (recoveredCost == null) return undefined;
    // Classic adjusts order margin using the net sale value of physically returned merchandise.
    margin -= receipt.estimateMinor - recoveredCost;
  }
  return margin;
}

export function mergeHybridClassic(report: RecordData, hybrid: HybridReportData | null, period: Period, includeProfit = false) {
  if (!hybrid || !hybrid.orders.length) return { report, note: hybrid?.issue };
  const placed = hybrid.orders.filter(order => within(order.placedAt, period));
  const hybridTotals = totals(placed);
  const summary = obj(report.totals);
  const native = obj(summary.orders);
  const margins = includeProfit ? placed.filter(order => order.dispatched || order.wasDelivered).map(hybridOrderMargin) : [];
  const measuredMargins = margins.filter((margin): margin is number => margin != null);
  const profit = measuredMargins.reduce((sum, margin) => sum + Math.max(0, margin), 0);
  const loss = measuredMargins.reduce((sum, margin) => sum + Math.max(0, -margin), 0);
  const missingProfit = margins.length - measuredMargins.length;
  const returns = obj(summary.returns);
  const receipts = periodActivity(hybrid.orders, period).returns;
  const paidRefund = hybrid.orders.filter(order => order.wasDelivered).reduce((sum, order) => sum + order.returns.reduce((subtotal, receipt) =>
    subtotal + (within(receipt.confirmedAt, period) ? receipt.confirmedMinor ?? 0 : 0), 0), 0) / 100;
  const costReceipts = hybrid.orders.flatMap(order => order.inventoryReceipts ?? []).filter(receipt => within(receipt.receivedAt, period));
  const returnedCost = costReceipts.reduce((sum, receipt) => sum + (receipt.costMinor ?? 0), 0) / 100;
  const missingCosts = costReceipts.filter(receipt => receipt.costMinor == null).length;
  const returnedUnits = receipts.reduce((sum, receipt) => sum + receipt.lines.reduce((qty, line) => qty + line.quantity, 0), 0);
  const byDay = new Map<string, number>();
  for (const order of placed) {
    const key = date(order.placedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + order.totalMinor);
  }
  return { report: { ...report, totals: { ...summary, orders: {
    ...native, count: numeric(native.count) + placed.length, total_quantity: numeric(native.total_quantity) + hybridTotals.units,
    totalOrdersAmount: round(numeric(native.totalOrdersAmount) + hybridTotals.value / 100),
    totalOrdersDiscount: round(numeric(native.totalOrdersDiscount) + hybridTotals.discount / 100),
    totalDue: round(numeric(native.totalDue) + placed.reduce((due, order) => due + numeric(order.dueMinor), 0) / 100),
    ...(includeProfit && { totalProfit: round(numeric(native.totalProfit) + profit / 100),
      totalLoss: round(numeric(native.totalLoss) + loss / 100) }),
  }, returns: { ...returns, totalRefund: round(numeric(returns.totalRefund) + paidRefund),
    ...(costReceipts.length && { totalReturnedCost: round(numeric(returns.totalReturnedCost) + returnedCost) }),
    total_quantity: numeric(returns.total_quantity) + returnedUnits, count: numeric(returns.count) + receipts.length,
  } }, daily: arr(report.daily).map(obj).map(row => ({ ...row, orders: round(numeric(row.orders) + (byDay.get(str(row.date).slice(0, 10)) ?? 0) / 100) })) },
  note: [
    placed.length ? 'Online order totals and outstanding payments include Hybrid checkout.' : '',
    missingProfit ? 'Profit excludes ' + missingProfit + (missingProfit === 1 ? ' Hybrid order' : ' Hybrid orders') + ' with incomplete warehouse cost records.' : '',
  ].filter(Boolean).join(' ') || undefined,
  returnNote: [
    receipts.length || paidRefund ? 'Includes Hybrid returns by receipt date and refunds by confirmation date.' : '',
    missingCosts ? 'Purchase-cost evidence is missing for ' + missingCosts + ' Hybrid ' + (missingCosts === 1 ? 'return receipt.' : 'return receipts.') : '',
  ].filter(Boolean).join(' ') || undefined };
}

export function mergeHybridSalesReport(data: RecordData, orders: HybridReportOrder[]) {
  const meta = obj(data.meta);
  const current = periodActivity(orders, periodOf(meta));
  const previousMeta = obj(meta.compare);
  const previous = previousMeta.from ? periodActivity(orders, periodOf(previousMeta)) : periodActivity([], {});
  const currentTotals = activityTotals(current);
  const priorTotals = activityTotals(previous);
  const kpis = arr(data.kpis).map(obj);
  const placed = kpis.find(item => item.key === 'ordersPlaced');
  const sold = kpis.find(item => item.key === 'deliveredValue');
  const addedMetrics: Record<string, keyof typeof currentTotals | undefined> = {
    ordersPlaced: 'ordersPlaced', bookedValue: 'bookedValue', deliveredValue: 'deliveredValue',
    returnsValue: 'returnsValue', deliveryIncome: 'deliveryIncome',
  };
  const revised = (item: RecordData, current: number, previous: number) => ({ ...item,
    value: round(numeric(item.value) + current),
    previous: typeof item.previous === 'number' ? round(item.previous + previous) : item.previous,
  });
  const series = obj(data.series);
  const tables = arr(data.tables).map(obj);
  const periodTable = tables.find(table => table.id === 'periods');
  const nativeSold = numeric(obj(periodTable?.totals).deliveredOrders);
  const nativePrevSold = obj(data.mergeInputs).previousDeliveredOrders;
  const groups = activityBuckets(current, str(series.unit));
  const mergeRow = (row: RecordData, extra = groups.get(str(row.key))) => {
    if (!extra) return row;
    const activity = addSeriesActivity(row, extra);
    const netSales = round(numeric(row.netSales) + extra.deliveredValue - extra.returnsValue);
    return { ...activity, deliveryIncome: round(numeric(row.deliveryIncome) + extra.deliveryIncome),
      returnsCount: numeric(row.returnsCount) + extra.returnsCount, returnsValue: round(numeric(row.returnsValue) + extra.returnsValue),
      netSales, aov: average(numeric(activity.deliveredValue), numeric(activity.deliveredOrders)),
      _tones: { ...obj(row._tones), netSales: netSales < 0 ? 'danger' : undefined } };
  };
  const valued = {
    ...data,
    kpis: kpis.map(item => {
      const key = str(item.key);
      const metric = addedMetrics[key];
      if (metric) return {
        ...revised(item, currentTotals[metric], priorTotals[metric]),
        ...(metric === 'returnsValue' && currentTotals.estimatedValues > 0 && {
          estimated: 'Some returns have no confirmed refund. Their value is estimated from the returned items.',
        }),
      };
      if (key === 'netSales') return revised(item, currentTotals.deliveredValue - currentTotals.returnsValue, priorTotals.deliveredValue - priorTotals.returnsValue);
      if (key === 'aov' && sold) return {
        ...item, value: average(numeric(sold.value) + currentTotals.deliveredValue, nativeSold + currentTotals.deliveredOrders),
        previous: typeof nativePrevSold === 'number' && typeof sold.previous === 'number'
          ? average(sold.previous + priorTotals.deliveredValue, nativePrevSold + priorTotals.deliveredOrders) : item.previous,
      };
      if (key !== 'cancellationRate' || !placed) return item;
      const rate = (priorRate: unknown, count: number, add: number, cancelled: number) =>
        count + add ? (Math.round(numeric(priorRate) * count) + cancelled) / (count + add) : priorRate;
      const value = rate(item.value, numeric(placed.value), current.booked.length, totals(current.booked).cancelled);
      return { ...item, value,
        previous: previousMeta.from ? rate(item.previous, numeric(placed.previous), previous.booked.length, totals(previous.booked).cancelled) : item.previous,
        tone: typeof value === 'number' ? value >= .15 ? 'danger' : value >= .05 ? 'warning' : 'success' : item.tone,
      };
    }),
    series: { ...series, points: arr(series.points).map(obj).map(point => mergeRow(point)) },
    tables: tables.map(table => table !== periodTable ? table : {
      ...table, rows: arr(table.rows).map(obj).map(row => mergeRow(row)), totals: mergeRow(obj(table.totals), currentTotals),
    }),
  };
  return noteMissingDeliveryDates(valued, orders);
}
