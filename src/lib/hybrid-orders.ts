import 'server-only';
import { createHmac } from 'node:crypto';
import { api, ApiError, canWrite, integratedCheckoutEnabled, mongoId, obj, str, url, type Session } from './api';
import { has, superAdmin, type Region } from './sections';
import { hybridStatusLabels, type HybridFulfillment, type HybridOrderOperations, type HybridReturnCost, type HybridReturnCostReceipt, type HybridShipment } from './hybrid-fulfillment';
import { statusLabel, type Listing, type Order, type OrderDetail, type OrderFilters, type OrderLocation, type OrderNote } from './website-orders';

const orderIdPrefix = 'hybrid-';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const workspaceLimit = 10_000;

type HybridItem = { productName: string; variantName: string; sku: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number;
  variantId?: string; variant?: { productId: string; inventory?: { available: number } | null; product: { department: { id: string; name: string } } } };
type HybridReturn = { id?: string; status: string; createdAt?: string; returnReceivedAt?: string | null;
  returnDisposition?: 'RESTOCK' | 'HOLD' | null; returnCost?: HybridReturnCost | null;
  refundAmountMinor?: number | null; refundConfirmedAt?: string | null;
  returnLines: { quantity: number; orderItem?: HybridItem }[] };
type HybridOrder = {
  id: string; reference: string; createdAt: string; status: string; fulfillmentStatus: string; currency: 'BDT';
  districtLabel: string; totalMinor: number; subtotalMinor?: number; discountMinor?: number; deliveryMinor?: number; taxMinor?: number;
  items: HybridItem[];
  shippingWarehouseId?: string | null; shippingWarehouseName?: string | null;
  payment: { method: string; status: string; amountMinor: number; collectedAt?: string | null } | null;
  bangladeshShipment: (HybridShipment & { statusUpdatedAt?: string }) | null;
  bangladeshRefusedParcelReceipt?: HybridFulfillment['receipt'];
  manualPayment?: HybridFulfillment['manualPayment'];
  events?: { status: string; type: string; createdAt: string; actor: { name: string } | null }[];
  cases?: HybridReturn[];
  operations?: HybridOrderOperations & { customerName: string; phone: string; address: string; locality: string; notes: OrderNote[] };
};

export function hybridOrderId(value: string) {
  const id = value.slice(orderIdPrefix.length);
  return value.startsWith(orderIdPrefix) && uuid.test(id) ? id : null;
}

function checkoutConnection(auth: Session, region: Region) {
  if (region !== 'BD' || !has(auth.staff, 'order.view') || !integratedCheckoutEnabled()) return;
  const token = process.env.GRIIP_HYBRID_ADMIN_ORDERS_TOKEN;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const port = process.env.GRIIP_ADMIN_TARGET === 'fixture' ? process.env.GRIIP_ADMIN_HYBRID_FIXTURE_PORT : '4402';
  if (!port || !/^44\d{2}$/.test(port)) return;
  return { token, port };
}

async function checkoutRead<T>({ token, port }: NonNullable<ReturnType<typeof checkoutConnection>>, params: Record<string, string | undefined>, timeout = 8000, proof?: string) {
  const response = await fetch(url('http://127.0.0.1:' + port + '/api/internal/dev-admin-orders', params), {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(proof && { 'X-Griip-Hybrid-Proof': proof }) }, cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(timeout),
  }).catch(() => { throw new ApiError(503, 'Checkout orders are temporarily unavailable.'); });
  if (!response.ok) throw new ApiError(response.status);
  return await response.json() as T;
}

function checkoutProof(secret: string, purpose: string, body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', Buffer.from(secret, 'hex')).update(purpose + '\n' + timestamp + '\n' + body).digest('hex');
  return timestamp + '.' + signature;
}

const returnActions = ['open-return', 'review-return', 'receive-return', 'confirm-return-refund'];

function checkoutFulfillmentConnection(auth: Session, region: Region) {
  const connection = checkoutConnection(auth, region);
  const secret = process.env.GRIIP_HYBRID_ADMIN_FULFILLMENT_TOKEN;
  if (!connection || !secret || !/^[a-f0-9]{64}$/.test(secret) || !mongoId(auth.staff.id) ||
      !canWrite(auth.staff) || !has(auth.staff, 'order.update')) return;
  return { ...connection, secret, canReturn: has(auth.staff, 'order.return'), canRecordReturnCost: has(auth.staff, 'purchase.price.view') };
}

export async function saveHybridFulfillment(id: string, auth: Session, region: Region, command: Record<string, unknown>) {
  const connection = checkoutFulfillmentConnection(auth, region);
  if (!connection) throw new ApiError(403, 'Access denied.');
  if (!uuid.test(id)) throw new ApiError(404, 'Order not found.');
  if (!['advance', 'track', 'receive', 'record-return-cost', 'collect', 'cancel', 'approve-wallet', 'decline-wallet', 'edit-contact', 'add-note', ...returnActions].includes(str(command.action))) {
    throw new ApiError(400, 'Invalid fulfillment action.');
  }
  if ((returnActions.includes(str(command.action)) || command.action === 'receive' || command.action === 'track' && command.status === 'REFUSED') && !connection.canReturn) {
    throw new ApiError(403, 'Access denied.');
  }
  if (command.action === 'record-return-cost' && (!connection.canReturn || !connection.canRecordReturnCost)) {
    throw new ApiError(403, 'Access denied.');
  }
  const assignedWarehouseId = assignedHybridWarehouse(auth);
  const { warehouseId: requestedWarehouse, ...signedCommand } = command;
  const warehouseId = str(requestedWarehouse);
  if (command.action === 'advance' && command.next === 'SHIPPED') {
    if (!mongoId(warehouseId)) throw new ApiError(400, 'Choose a shipping warehouse.');
    const [warehouse] = await loadHybridWarehouses(auth, region, warehouseId);
    if (!warehouse || warehouse.value !== warehouseId.toLowerCase()) throw new ApiError(403, 'Choose an available shipping warehouse.');
    signedCommand.warehouse = { id: warehouse.value, name: warehouse.label };
  }
  const name = auth.staff.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || 'Admin operator';
  const body = JSON.stringify({
    id, operator: { id: auth.staff.id.toLowerCase(), name, canReturn: connection.canReturn, assignedWarehouseId,
      ...(command.action === 'record-return-cost' && { canRecordReturnCost: connection.canRecordReturnCost }) },
    command: signedCommand,
  });
  const proof = checkoutProof(connection.secret, 'griipbuddy/hybrid-fulfillment/v1', body);
  const response = await fetch('http://127.0.0.1:' + connection.port + '/api/internal/dev-admin-orders', {
    method: 'POST', body,
    headers: { Authorization: 'Bearer ' + connection.token, 'Content-Type': 'application/json', 'X-Griip-Hybrid-Proof': proof },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
  }).catch(() => { throw new ApiError(503, 'Could not confirm the fulfillment change. Refresh the order before retrying.'); });
  if (!response.ok) {
    const data = obj(await response.json().catch(() => ({})));
    throw new ApiError(response.status, str(data.error).slice(0, 320) || (response.status === 404
      ? 'Order or fulfillment action not found.' : 'Could not confirm the fulfillment change. Refresh the order before retrying.'));
  }
}

function visibleStatus(order: HybridOrder) {
  if (order.status === 'CANCELLED') return 'CANCELLED';
  const delivery = order.bangladeshShipment?.status;
  if (delivery === 'REFUSED') return order.bangladeshRefusedParcelReceipt ? 'RETURNED' : 'PENDING_RETURN';
  if (delivery === 'DELIVERED' || order.fulfillmentStatus === 'DELIVERED') {
    const returnedUnits = order.cases?.reduce((sum, item) => sum + (item.returnReceivedAt
      ? item.returnLines.reduce((units, line) => units + line.quantity, 0) : 0), 0) ?? 0;
    if (returnedUnits >= order.items.reduce((sum, item) => sum + item.quantity, 0)) return 'RETURNED';
    if (order.cases?.some(item => !item.returnReceivedAt && ['OPEN', 'IN_REVIEW', 'RETURN_APPROVED'].includes(item.status))) return 'RETURN_REQUESTED';
    return returnedUnits ? 'PARTIAL' : 'DELIVERED';
  }
  if (delivery === 'OUT_FOR_DELIVERY' || delivery === 'IN_TRANSIT' || order.fulfillmentStatus === 'SHIPPED') return 'IN_TRANSIT';
  if (order.fulfillmentStatus === 'READY_TO_SHIP') return 'IN_REVIEW';
  if (order.fulfillmentStatus === 'PACKING') return 'PROCESSING';
  if (order.payment?.status === 'AWAITING_VERIFICATION') return 'INCOMPLETE';
  return 'PLACED';
}

export function canReadHybridReports(auth: Session, region: Region) {
  return !!checkoutConnection(auth, region);
}

function assignedHybridWarehouse(auth: Session) {
  const value = auth.staff.assignedLocation;
  return !superAdmin(auth.staff) && value && mongoId(value) ? value.toLowerCase() : undefined;
}

export function hybridReportLocations(auth: Session, locations?: string) {
  const assigned = assignedHybridWarehouse(auth);
  const requested = locations?.split(',').map(value => value.toLowerCase());
  if (requested?.some(value => !mongoId(value)) || (requested?.length ?? 0) > 20) {
    throw new ApiError(400, 'Choose valid warehouse locations.');
  }
  if (assigned && requested?.some(value => value !== assigned)) throw new ApiError(403, 'Choose your assigned location.');
  return assigned ?? requested?.join(',');
}

async function loadHybridWarehouses(auth: Session, region: Region, location?: string) {
  if (!has(auth.staff, 'business_locations.view')) throw new ApiError(403, 'Warehouse access is required.');
  return await api(url('/order/workspace/warehouses', { region, location }), auth.token) as OrderLocation[];
}

export type HybridReportOrder = {
  status: string; placedAt: number; totalMinor: number; dueMinor: number; productMinor: number; discountMinor: number; units: number;
  awaitingPayment: boolean; claimedMinor: number; inTransit: boolean; uncollectedCodMinor: number; dispatched: boolean;
  id: string; reference: string; district: string; warehouse?: string; statusAt: number; dispatchedAt?: number; deliveredAt?: number; deliveryMinor: number;
  wasDelivered: boolean; lines: HybridReportLine[]; returns: HybridReportReturn[];
  inventoryReceipts?: { receivedAt: number; costMinor?: number }[];
};
export type HybridReportLine = { id: string; sku: string; name: string; productId?: string;
  categoryId?: string; category?: string; quantity: number; amountMinor: number; pooledOnHand?: number };
export type HybridReportReturn = { receivedAt: number; confirmedAt?: number; estimateMinor: number; confirmedMinor?: number; lines: HybridReportLine[] };
export type HybridReportData = { orders: HybridReportOrder[]; issue?: string };

function eventTime(value?: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function returnLine(item: HybridItem, quantity: number): HybridReportLine {
  const department = item.variant?.product?.department;
  return { id: item.variantId || item.sku, sku: item.sku, name: item.productName, productId: item.variant?.productId,
    categoryId: department?.id, category: department?.name, quantity,
    // Imported Mongo variants already use the location stock ledger on combined reports.
    pooledOnHand: item.variantId && !/^v-[a-f0-9]{24}$/i.test(item.variantId) ? item.variant?.inventory?.available : undefined,
    amountMinor: Math.floor(item.lineTotalMinor * quantity / item.quantity) };
}

export async function loadHybridReportOrders(auth: Session, region: Region, scope: {
  locations?: string; from?: string; to?: string; active?: boolean; milestones?: boolean; returnCosts?: boolean;
}): Promise<HybridReportData | null> {
  if (!canReadHybridReports(auth, region)) return null;
  const locations = hybridReportLocations(auth, scope.locations);
  const connection = checkoutConnection(auth, region)!;
  const validNumber = (value: number) => Number.isSafeInteger(value) && value >= 0;
  try {
    const readPurchaseCost = scope.milestones && scope.returnCosts && has(auth.staff, 'purchase.price.view');
    const listing = await checkoutRead<{ workspaceOrders?: HybridOrder[]; reportOrders?: HybridOrder[]; tooMany: boolean }>(
      connection, { view: scope.milestones ? 'reporting' : 'workspace', from: scope.from, to: scope.to, locations,
        active: scope.active ? '1' : undefined, costs: readPurchaseCost ? '1' : undefined }, 5000);
    if (listing.tooMany) return { orders: [], issue: 'Hybrid checkout exceeds the reporting feed limit. These figures cover legacy orders.' };
    const seen = new Set<string>();
    const selected = locations?.split(',');
    const orders = (scope.milestones ? listing.reportOrders! : listing.workspaceOrders!)
      .filter(order => !selected || order.shippingWarehouseId && selected.includes(order.shippingWarehouseId)).map(order => {
      const placedAt = Date.parse(order.createdAt);
      if (seen.has(order.id) || order.currency !== 'BDT' || !Number.isFinite(placedAt) || !validNumber(order.totalMinor)
        || !order.items.length || order.items.some(item => !validNumber(item.quantity) || item.quantity === 0 || !validNumber(item.lineTotalMinor)
          || !validNumber(item.unitPriceMinor) || item.lineTotalMinor > item.unitPriceMinor * item.quantity)
        || (order.payment && !validNumber(order.payment.amountMinor))) throw new Error('Invalid Hybrid report data');
      seen.add(order.id);
      const inTransit = ['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(order.bangladeshShipment?.status ?? '');
      const awaitingPayment = order.payment?.status === 'AWAITING_VERIFICATION' && order.status === 'PLACED';
      const status = visibleStatus(order);
      const shipmentAt = (status: string) => eventTime(order.bangladeshShipment?.events?.find(event => event.status === status)?.recordedAt);
      const fulfillmentAt = (status: string) => eventTime(order.events?.find(event => event.status === status)?.createdAt);
      const deliveredAt = shipmentAt('DELIVERED') ?? fulfillmentAt('DELIVERED');
      const dispatchedAt = shipmentAt('IN_TRANSIT') ?? fulfillmentAt('SHIPPED');
      const returnCases = scope.milestones ? order.cases ?? [] : [];
      const openReturnAt = returnCases.reduce<number | undefined>((time, entry) => !entry.returnReceivedAt
        ? Math.max(time ?? placedAt, eventTime(entry.createdAt) ?? placedAt) : time, undefined);
      const returns = returnCases.flatMap(entry => {
        const receivedAt = eventTime(entry.returnReceivedAt);
        if (receivedAt == null) return [];
        const confirmedAt = eventTime(entry.refundConfirmedAt);
        const confirmedMinor = confirmedAt != null && confirmedAt >= receivedAt && entry.refundAmountMinor != null && validNumber(entry.refundAmountMinor)
          ? entry.refundAmountMinor : undefined;
        const lines = entry.returnLines.map(line => {
          if (!line.orderItem || !validNumber(line.quantity) || line.quantity === 0 || line.quantity > line.orderItem.quantity ||
              !validNumber(line.orderItem.quantity) || !validNumber(line.orderItem.lineTotalMinor)) throw new Error('Invalid Hybrid return data');
          return returnLine(line.orderItem, line.quantity);
        });
        return [{ receivedAt, confirmedAt, confirmedMinor, lines, estimateMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0) }];
      });
      const inventoryReceipts = readPurchaseCost ? returnCases.flatMap(entry => {
        const receivedAt = eventTime(entry.returnReceivedAt);
        if (receivedAt == null || entry.returnDisposition === 'HOLD') return [];
        const cost = entry.returnCost?.amountMinor;
        return [{ receivedAt, costMinor: cost != null && validNumber(cost) ? cost : undefined }];
      }) : undefined;
      const refused = order.bangladeshRefusedParcelReceipt;
      const refusedAt = eventTime(refused?.receivedAt);
      if (inventoryReceipts && refusedAt != null && refused?.disposition === 'RESTOCK' && refused.restockedUnits > 0) {
        const cost = refused.returnCost?.amountMinor;
        inventoryReceipts.push({ receivedAt: refusedAt, costMinor: cost != null && validNumber(cost) ? cost : undefined });
      }
      return {
        inventoryReceipts, status, placedAt, totalMinor: order.totalMinor, inTransit, awaitingPayment,
        dueMinor: order.status === 'PLACED' && (awaitingPayment || order.payment?.status === 'AWAITING_COLLECTION')
          ? order.payment!.amountMinor : 0,
        id: orderIdPrefix + order.id, reference: order.reference, district: order.districtLabel, warehouse: order.shippingWarehouseName ?? undefined,
        dispatchedAt, deliveredAt, deliveryMinor: order.deliveryMinor ?? 0,
        wasDelivered: deliveredAt != null || order.fulfillmentStatus === 'DELIVERED' || order.bangladeshShipment?.status === 'DELIVERED',
        statusAt: (status === 'RETURN_REQUESTED' ? openReturnAt : undefined) ?? eventTime(order.bangladeshShipment?.statusUpdatedAt) ??
          fulfillmentAt(order.fulfillmentStatus) ?? placedAt,
        lines: order.items.map(item => returnLine(item, item.quantity)), returns,
        dispatched: !!order.bangladeshShipment || ['SHIPPED', 'DELIVERED'].includes(order.fulfillmentStatus),
        productMinor: order.items.reduce((sum, item) => sum + item.lineTotalMinor, 0),
        discountMinor: order.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity - item.lineTotalMinor, 0),
        units: order.items.reduce((sum, item) => sum + item.quantity, 0),
        claimedMinor: awaitingPayment ? order.payment!.amountMinor : 0,
        uncollectedCodMinor: inTransit && order.payment?.method === 'COD' && order.payment.status === 'AWAITING_COLLECTION'
          ? order.payment.amountMinor : 0,
      };
    });
    return { orders };
  } catch {
    return { orders: [], issue: 'Hybrid checkout figures are unavailable. These figures cover legacy orders.' };
  }
}

const amount = (minor?: number) => typeof minor === 'number' ? minor / 100 : undefined;

function orderRow(order: HybridOrder): Order {
  const paid = order.payment?.status === 'COLLECTED' || order.payment?.status === 'PAID';
  const due = order.payment?.status === 'AWAITING_COLLECTION' && order.payment.method === 'COD';
  return {
    _id: orderIdPrefix + order.id, order_serial_id: 0, invoice_number: order.reference, order_date: order.createdAt,
    status: visibleStatus(order), currency: 'BDT', total_amount: amount(order.totalMinor),
    ...(paid && { paid_amount: amount(order.payment?.amountMinor) }), ...(due && { COD: amount(order.payment?.amountMinor) }),
    order_by: 'Online checkout', delivery_address: { district: order.districtLabel },
    ...(order.shippingWarehouseId && order.shippingWarehouseName && {
      assigned_business_location: { _id: order.shippingWarehouseId, name: order.shippingWarehouseName },
    }),
    products: order.items.map(item => ({ name: item.productName, sku: item.sku, quantity: item.quantity, unitPrice: amount(item.unitPriceMinor),
      amount: amount(item.lineTotalMinor), attributes: item.variantName ? [item.variantName] : [] })),
    checkoutProjection: true, tracking_code: order.bangladeshShipment?.trackingReference,
  };
}

export async function getHybridOrder(id: string, auth: Session, region: Region): Promise<{ order: OrderDetail; fulfillment: HybridFulfillment }> {
  const connection = checkoutConnection(auth, region);
  if (!connection || !uuid.test(id)) throw new ApiError(404);
  const canReadCost = has(auth.staff, 'purchase.price.view');
  const assigned = assignedHybridWarehouse(auth);
  const secret = process.env.GRIIP_HYBRID_ADMIN_FULFILLMENT_TOKEN;
  const params = { id, ...(canReadCost && { costs: '1' }), ...(secret && /^[a-f0-9]{64}$/.test(secret) &&
    { ops: '1', ...(assigned && { warehouse: assigned }) }) };
  const proof = params.ops && secret
    ? checkoutProof(secret, 'griipbuddy/hybrid-order-details/v1', new URLSearchParams(params).toString()) : undefined;
  const order = await checkoutRead<HybridOrder>(connection, params, 8000, proof);
  if (order.id !== id || order.currency !== 'BDT' || !Array.isArray(order.items)) throw new ApiError(502);
  if (assigned && order.shippingWarehouseId && assigned !== order.shippingWarehouseId) throw new ApiError(404, 'Order not found.');
  const editable = checkoutFulfillmentConnection(auth, region);
  const warehouseChoices = editable && order.status === 'PLACED' && order.fulfillmentStatus === 'READY_TO_SHIP'
    ? await loadHybridWarehouses(auth, region).catch(() => []) : [];
  const returnCostReceipts: HybridReturnCostReceipt[] = [];
  if (canReadCost && (!assigned || assigned === order.shippingWarehouseId)) {
    for (const entry of order.cases ?? []) {
      if (!entry.id || entry.returnDisposition !== 'RESTOCK' || !entry.returnReceivedAt) continue;
      const quantity = entry.returnLines.reduce((sum, line) => sum + line.quantity, 0);
      if (quantity > 0) returnCostReceipts.push({ caseId: entry.id, receivedAt: entry.returnReceivedAt, quantity, cost: entry.returnCost });
    }
    const receipt = order.bangladeshRefusedParcelReceipt;
    if (receipt?.disposition === 'RESTOCK' && receipt.restockedUnits > 0) {
      returnCostReceipts.push({ receivedAt: receipt.receivedAt, quantity: receipt.restockedUnits, cost: receipt.returnCost });
    }
    returnCostReceipts.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  }
  const receipt = order.bangladeshRefusedParcelReceipt;
  const activity = (order.events ?? []).map(event => ({ by: event.actor?.name ?? 'Online checkout', at: event.createdAt,
    text: event.type === 'ORDER_PLACED' ? 'Order placed' : event.type === 'ORDER_CANCELLED' ? 'Cancelled' : hybridStatusLabels[event.status] ?? event.status }));
  const operations = order.operations;
  const statusHistory = [
    ...activity.map(event => ({ by: event.by, at: event.at, status: event.text })),
    ...(order.bangladeshShipment?.events ?? []).map(event => ({
      by: order.bangladeshShipment?.carrier ?? 'Courier', at: event.recordedAt, status: hybridStatusLabels[event.status] ?? statusLabel(event.status),
    })),
    ...operations?.cases.flatMap(entry => entry.events.map(event => ({
      by: event.actor?.name ?? 'Customer', at: event.createdAt, status: event.refundConfirmed ? 'Refund confirmed' : event.status === 'OPEN' ? 'Return requested' : statusLabel(event.status),
    }))) ?? [],
  ].sort((left, right) => right.at.localeCompare(left.at));
  return {
    order: { ...orderRow(order), ...(operations && {
      customer_name: operations.customerName, customer_phone: operations.phone,
      delivery_address: { address: operations.address, district: order.districtLabel, thana: operations.locality },
    }), sub_total: amount(order.subtotalMinor), total_discount: amount(order.discountMinor),
      delivery_charge: amount(order.deliveryMinor), tax: amount(order.taxMinor), payment_type: order.payment?.method,
      payment: order.payment ? { amount: amount(order.payment.amountMinor), date: order.payment.collectedAt ?? undefined, status: order.payment.status } : undefined,
      notes: operations?.notes ?? [], activity, statusHistory, discounts: [] },
    fulfillment: { status: order.status, step: order.fulfillmentStatus, payment: order.payment, shipment: order.bangladeshShipment,
      receipt: receipt ? { receivedAt: receipt.receivedAt, disposition: receipt.disposition,
        restockedUnits: receipt.restockedUnits, note: receipt.note } : null,
      manualPayment: editable ? order.manualPayment ?? null : null,
      ...(operations && { operations: { updatedAt: operations.updatedAt, items: operations.items, cases: operations.cases } }),
      editable: !!editable, canReturn: editable?.canReturn ?? false, warehouseChoices,
      canRecordReturnCost: Boolean(editable?.canReturn && editable?.canRecordReturnCost), returnCostReceipts,
      shippingWarehouse: order.shippingWarehouseName ?? undefined },
  };
}

const sortDate = (row: Order) => Date.parse(row.order_date ?? '') || 0;

export async function loadWebsiteOrders(auth: Session, region: Region, filters: OrderFilters, page?: string, limit?: string,
  { exportOrders = false, assigned = false }: { exportOrders?: boolean; assigned?: boolean } = {}) {
  const native = (ahead?: number) => api(url('/order/workspace/orders', { region, ...filters, page, limit,
    assigned: assigned ? '1' : undefined, includeAhead: ahead ? String(ahead) : undefined }), auth.token) as Promise<Listing & { start?: number }>;
  const connection = checkoutConnection(auth, region);
  if (!connection || filters.called === 'true' || (filters.creator && !['USER', 'GUEST'].includes(filters.creator))) {
    return exportOrders ? null : native();
  }
  const locations = hybridReportLocations(auth, filters.location);
  const projected = await checkoutRead<{ workspaceOrders: HybridOrder[]; tooMany: boolean }>(connection, {
    view: 'workspace', assigned: assigned ? '1' : undefined, q: filters.q, sku: filters.sku, from: filters.from, to: filters.to, creator: filters.creator,
    locations,
  }).catch(reason => {
    if (reason instanceof ApiError && reason.status === 400) throw reason;
    if (exportOrders) throw new ApiError(503, 'Checkout orders are temporarily unavailable.');
    return null;
  });
  if (projected === null) return { ...await native(), hybridUnavailable: true };
  if (projected.tooMany) throw new ApiError(422);
  const selected = locations?.split(',');
  const orders = projected.workspaceOrders.filter(order => (!assigned || order.shippingWarehouseId) &&
    (!selected || order.shippingWarehouseId && selected.includes(order.shippingWarehouseId))).map(orderRow);
  if (!orders.length) return exportOrders ? null : native();

  const statuses = new Set(filters.filter?.split(',').filter(Boolean));
  const hybridRows = statuses.size ? orders.filter(order => statuses.has(order.status)) : orders;
  if (exportOrders && !hybridRows.length) return null;
  const listing = await native(hybridRows.length);
  const total = listing.total + hybridRows.length;
  if (limit === 'all' && total > workspaceLimit) throw new ApiError(422);
  const counts = { ...listing.counts };
  counts.ALL = (counts.ALL ?? 0) + orders.length;
  for (const row of orders) counts[row.status] = (counts[row.status] ?? 0) + 1;

  // The API includes enough earlier native rows to account for every checkout insertion.
  const offset = limit === 'all' ? 0 : (listing.page - 1) * listing.size;
  const start = offset - (listing.start ?? offset);
  const rows = [...listing.rows, ...hybridRows].sort((left, right) => sortDate(right) - sortDate(left) || right._id.localeCompare(left._id));
  return { ...listing, total, counts, rows: limit === 'all' ? rows : rows.slice(start, start + listing.size),
    size: limit === 'all' ? Math.max(1, rows.length) : listing.size };
}
