export const marketplaceOrderQueues = [
  ['queue', 'Packing queue'], ['all', 'All Marketplace orders'], ['UNFULFILLED', 'Unfulfilled'], ['PACKING', 'Packing'],
  ['READY_TO_SHIP', 'Ready to ship'], ['SHIPPED', 'Shipped'], ['DELIVERED', 'Delivered'], ['exceptions', 'Delivery exceptions'],
  ['refused', 'Refused parcels'], ['CANCELLED', 'Cancelled'],
] as const;
export type MarketplaceOrderQueue = (typeof marketplaceOrderQueues)[number][0];

export const connectedOrderActions = [
  'order.advance', 'order.tracking', 'order.parcel.dispatch', 'order.parcel.tracking', 'order.parcel.receive',
  'order.parcel.prepare', 'order.parcel.split', 'order.parcel.reference', 'order.parcel.exception', 'order.parcel.refresh',
  'order.cancel', 'order.collect', 'order.case',
] as const;
export type ConnectedOrderAction = (typeof connectedOrderActions)[number];

export const marketplaceOrdersPath = '/dashboard/marketplace-orders';
export const marketplaceCasesPath = `${marketplaceOrdersPath}/cases`;
export const nativeOrderPrefix = 'native-';
export const orderIdentifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function nativeOrderId(recordId: string) {
  const id = recordId.slice(nativeOrderPrefix.length);
  return recordId.startsWith(nativeOrderPrefix) && orderIdentifier.test(id) ? id : null;
}

export type OrderList = {
  rows: { id: string; reference: string; createdAt: string; fulfillment: string; districtLabel: string; currency: string;
    totalMinor: number; payment?: { status: string } | null; _count: { items: number }; pendingCancellation: boolean; requiresCodReview: boolean }[];
  hasNext: boolean;
};

export type PurchasedLine = {
  id: string; variantId: string; sku: string; productName: string; options: string; quantity: number; unitPriceMinor: number;
  personalization: string | null;
};

type Tracking = { status: string; carrier: string | null; reference: string | null; next: string[]; evidenceRequired: boolean };
type TrackingEvent = {
  id?: string; status: string; recordedAt: string; evidence: string | null;
  occurredAt?: string | null; source?: string | null; actor?: string | null; reason?: string | null; applied?: boolean;
};
export type ConnectedParcel = Tracking & {
  id: string; warehouse: string; dispatchable: boolean; receivable: boolean; disposition: 'RESTOCK' | 'HOLD' | null;
  preparationState?: 'PENDING' | 'PICKED' | 'PACKED' | null; preparable?: boolean;
  splittable?: boolean; editableReference?: boolean; canRecordException?: boolean; trackingRevision?: number;
  trackingStatus?: string; statusUpdatedAt?: string; canRefresh?: boolean; refreshReason?: string | null; estimatedDeliveryAt?: string | null;
  lastSyncedAt?: string | null; lastSyncAttemptAt?: string | null; syncError?: string | null;
  events: TrackingEvent[]; lines: PurchasedLine[];
};

type CaseSummary = { id: string; kind: string; status: string; updatedAt: string };
type OrderCaseIdentity = { id: string; reference: string };

export type CaseList = { rows: (CaseSummary & { order: OrderCaseIdentity })[]; hasNext: boolean };

export type ConnectedOrderDetail = {
  id: string; reference: string; status: string; createdAt: string; currency: string; marketName: string; locale: string; timeZone: string;
  fulfillment: string; totalMinor: number; subtotalMinor: number; discountMinor: number; deliveryMinor: number; taxMinor: number;
  payment: { method: string; status: string; dueMinor: number };
  shipping: { name: string; address: string; locality: string; district: string; postalCode: string | null; phone: string; service: string };
  lines: PurchasedLine[]; packable: boolean; pendingCancellation: boolean; requiresCodReview: boolean;
  next?: string; canCancel: boolean; canCollect: boolean;
  shipment: (Tracking & { events?: TrackingEvent[]; statusUpdatedAt?: string }) | null; parcels: ConnectedParcel[];
  events: { id: string; status: string; kind: string; date: string; actor: string | null }[];
  cases: CaseSummary[];
  sellers: { id: string; name: string; preparation: string; updatedAt: string | null }[];
};

export type ConnectedOrderCaseDetail = {
  id: string; kind: string; status: string; revision: number; order: OrderCaseIdentity & { currency: string; paymentMethod?: string | null }; locale: string; timeZone: string;
  events: { status: string; note: string | null; publicNote?: string | null; revision: number; createdAt: string }[];
  returnLines: (PurchasedLine & { replacementVariantName: string | null })[];
  returnDisposition: 'RESTOCK' | 'HOLD' | null; pickupAt: string | null; pickupReference: string | null;
  replacementTrackingReference: string | null; refundAmountMinor: number | null; refundLimitMinor: number;
  cancellationAppliedAt?: string | null;
  refund?: { state: 'AUTHORIZED' | 'PROCESSING' | 'CONFIRMED' | 'FAILED'; method: string; amountMinor: number; currency: string } | null;
  allowed: { review: string[]; cancel: boolean; refund: boolean; processRefund?: boolean; inspection: boolean; replacement: boolean; requiresCancellationRefund: boolean };
};
