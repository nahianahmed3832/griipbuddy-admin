import { adminPath } from './paths';

export type ManagedRefund = {
  id: string; amount: number; currency: string; state: string; providerId?: string; reference?: string;
  returnShipment?: string; lines?: { id: string; quantity: number }[]; reconciliation?: string;
};
export type ManagedPayment = {
  payment: { id: string; provider: string; currency: string; amount: number; captured: number; refunded: number;
    status: string; evidenceSubmitted: boolean; reconciliation?: string };
  providerId?: string; captureId?: string; evidence?: { reference?: string };
  transactionReference?: string; transactionAt?: string;
  collection?: { amount: number }; refund?: { amount: number; requiresReference: boolean };
  refundBalance?: { held: number; available: number; awaitingProviderReference: boolean };
  refunds?: ManagedRefund[];
};
export type ReviewLot = { id: string; lotNumber: string; available: number; sellableAvailable: number };
export type ReviewLine = { id: string; quantity: number; lots: ReviewLot[] };
export type ShipmentLine = { id: string; sku: string; quantity: number; tracked?: boolean; barcodes?: string[] };
type ShipmentParcel = { grams: number; length: number; width: number; height: number };
export type Shipment = {
  _id: string; warehouse: string; direction: 'return' | 'outbound'; state: string; provider: string;
  service?: string; origin?: string; parcels?: ShipmentParcel[];
  tracking?: string; receivedAt?: string; returnableLines?: ShipmentLine[]; lotReview?: ReviewLine[];
  lines: ShipmentLine[]; receiptLines?: { id: string; sellable: number; damaged: number }[];
};
export type ManagedOrder = {
  status: string; market: string; contactEditable: boolean; lines: ShipmentLine[]; shipments: Shipment[]; payment?: ManagedPayment;
  warehouses: { id: string; label: string; origin: string }[];
  zones: { service: string; origin: string; provider: string; label?: string }[];
};
export type ManagedMutation = {
  action: 'shipment-new' | 'shipment-action' | 'payment-action' | 'shipment-return-request' | 'refund-reconcile';
  id?: string; step?: string; values: Record<string, unknown>; keyed?: boolean;
};

export async function managedOrderRequest<T>(order: string, input?: ManagedMutation & { market: string; key?: string }, signal?: AbortSignal): Promise<T> {
  const result = await fetch(adminPath('/api/managed?order=' + encodeURIComponent(order)), {
    ...(input && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    cache: 'no-store', signal,
  });
  if (!result.ok) throw new Error((await result.text()).slice(0, 330) || 'Could not load the order operations.');
  return result.json();
}

export async function orderRetryKey(order: string, input: ManagedMutation) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([order, input])));
  const name = 'griipbuddy-order:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let key = crypto.randomUUID();
  try {
    key = window.localStorage.getItem(name) || key;
    window.localStorage.setItem(name, key);
  } catch { /* Browser storage is optional. */ }
  return { key, clear: () => { try { window.localStorage.removeItem(name); } catch { /* Storage is optional. */ } } };
}
