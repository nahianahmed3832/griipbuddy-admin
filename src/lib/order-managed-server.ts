import { api, ApiError, arr, mongoId, obj, str, type Session, type VerifiedMarketScope } from './api';
import { marketCode } from './managed';
import type { ManagedOrder, ManagedPayment } from './order-managed';

export async function managedOrderContext(id: string, auth: Session) {
  const [orderValue, managedValue] = await Promise.all([
    api('/order/' + id, auth.token), api('/global/admin/orders/' + id, auth.token),
  ]);
  const order = obj(orderValue);
  if (!order.managed_checkout) throw new ApiError(404, 'Managed order not found.');
  const context = obj(managedValue);
  const paymentId = str(order.managed_payment_id);
  const payment = arr(context.payments).map(obj).find(row => row.id === paymentId);
  const recordedMarket = str(context.market);
  const destination = str(obj(order.delivery_address).country).toUpperCase();
  const market = recordedMarket || (marketCode(destination) ? destination : order.region === 'BD' ? 'BD' : '');
  const currency = str(context.currency) || str(order.currency);
  const scope = marketCode(market) && /^[A-Z]{3}$/.test(currency)
    ? { marketId: market.toLowerCase(), currency } : undefined;
  return { order, shipments: arr(context.shipments) as ManagedOrder['shipments'], paymentId, payment, market, scope };
}

export function canEditManagedOrderContact({ order, shipments }: Awaited<ReturnType<typeof managedOrderContext>>) {
  return order.region !== 'INTERNATIONAL' && ['PLACED', 'ACCEPTED', 'PROCESSING', 'IN_REVIEW', 'NO_RESPONSE'].includes(str(order.status)) &&
    !order.transfer_to_courier && !order.consignment_id && !order.tracking_code && !order.inventory_packed_at &&
    !order.is_return_product_scan && shipments.length === 0;
}

async function readManagedPayment(id: string, auth: Session, scope?: VerifiedMarketScope): Promise<ManagedPayment> {
  const details = await api('/global/admin/payments/' + id, auth.token, undefined, scope) as ManagedPayment & { events?: unknown[] };
  const transaction = arr(details.events).map(obj).reverse().find(event => {
    const fact = obj(event.details);
    return event.kind === 'collected' || event.kind === 'staff_review' && fact.decision === 'approve' ||
      (event.kind === 'webhook' || event.kind === 'provider_observed') && fact.state === 'captured';
  });
  return { payment: details.payment, providerId: details.providerId, captureId: details.captureId, evidence: details.evidence,
    collection: details.collection, refund: details.refund, transactionAt: str(transaction?.createdAt),
    transactionReference: str(obj(transaction?.details).reference) };
}

export async function readManagedOrder(id: string, auth: Session, requestedMarket?: string): Promise<ManagedOrder> {
  if (requestedMarket !== undefined && !marketCode(requestedMarket)) throw new ApiError(400, 'Choose a supported market.');
  const context = await managedOrderContext(id, auth);
  const { order, shipments, paymentId, payment, market, scope } = context;
  if (requestedMarket !== undefined && (requestedMarket !== market || !scope)) {
    throw new ApiError(409, 'This order belongs to a different operating market.');
  }
  const address = obj(order.delivery_address);
  const destination = (str(address.state) || str(address.district)).toUpperCase();
  const status = str(order.status);
  const mayPlan = market && ['PLACED', 'IN_TRANSIT', 'PARTIAL'].includes(status) && !order.inventory_packed_at &&
    !order.is_assigned_to_business_location && !order.transfer_to_courier && ['authorized', 'captured'].includes(str(payment?.status)) &&
    (payment?.provider === 'cod' || Number(payment?.captured) > 0) && !payment?.reconciliation;
  const [details, settings, locations] = await Promise.all([
    mongoId(paymentId) ? readManagedPayment(paymentId, auth, scope) : undefined,
    mayPlan ? api('/global/admin/shipment-services/' + market, auth.token).catch(error => {
      if (error instanceof ApiError && [404, 422].includes(error.status)) return undefined;
      throw error;
    }) : undefined,
    mayPlan ? Promise.all((market === 'BD' ? ['BD'] : ['BD', 'INTERNATIONAL']).map(async region =>
      arr(obj(await api('/business-location?region=' + region, auth.token)).businessLocations).map(obj))) : [],
  ]);
  const zones = arr(obj(settings).zones).map(obj).filter(zone => zone.enabled &&
    (!arr(zone.regions).length || arr(zone.regions).some(region => str(region).toUpperCase() === destination))) as ManagedOrder['zones'];
  const warehouses = locations.flat().filter(row => mongoId(str(row._id)) && row.is_active !== false && !row.is_deleted).map(row => ({
    id: str(row._id), label: str(row.name) || str(row.business_location_name),
    origin: str(row.country_code) || (row.region === 'BD' || !row.region ? 'BD' : ''),
  })).filter(row => zones.some(zone => zone.origin === row.origin));
  const lines = arr(order.products).map(obj).map(row => ({
    id: str(row._id), sku: str(obj(row.selected_variant).sku), quantity: Number(row.total_quantity),
  })).filter(line => mongoId(line.id) && Number.isSafeInteger(line.quantity) && line.quantity > 0);
  return { status, market, contactEditable: canEditManagedOrderContact(context), shipments, lines, warehouses, zones, payment: details };
}
