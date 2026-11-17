export type HybridFulfillmentStep = 'PACKING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED';
export type HybridTrackingStep = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'REFUSED';

export type HybridShipment = {
  status: 'IN_TRANSIT' | HybridTrackingStep;
  carrier: string;
  trackingReference: string;
  source: 'DEV_SIMULATOR' | 'MANUAL';
  events?: { status: string; recordedAt: string }[];
};

export type HybridFulfillment = {
  status: string;
  step: string;
  payment: { method: string; status: string; amountMinor: number } | null;
  shipment: HybridShipment | null;
  receipt: { receivedAt: string; disposition: 'RESTOCK' | 'HOLD'; restockedUnits: number } | null;
  manualPayment: { transaction: string | null } | null;
  editable: boolean;
  canReturn: boolean;
};

export type HybridCommand =
  | { action: 'advance'; next: HybridFulfillmentStep; carrier?: string; trackingReference?: string; simulate?: boolean }
  | { action: 'track'; status: HybridTrackingStep; evidence?: string }
  | { action: 'receive'; disposition: 'RESTOCK' | 'HOLD'; note: string }
  | { action: 'collect' | 'cancel'; confirm: boolean }
  | { action: 'approve-wallet'; amountMinor: number; transaction: string; confirm: boolean }
  | { action: 'decline-wallet'; note: string; confirm: boolean };

const nextFulfillment: Record<string, HybridFulfillmentStep> = {
  UNFULFILLED: 'PACKING', PACKING: 'READY_TO_SHIP', READY_TO_SHIP: 'SHIPPED', SHIPPED: 'DELIVERED',
};

export const hybridStatusLabels: Record<string, string> = {
  UNFULFILLED: 'Unfulfilled', PACKING: 'Packing', READY_TO_SHIP: 'Ready to ship', SHIPPED: 'Shipped', DELIVERED: 'Delivered',
  IN_TRANSIT: 'In transit', OUT_FOR_DELIVERY: 'Out for delivery', REFUSED: 'Delivery refused',
};

export function hybridFulfillmentActions(state: HybridFulfillment) {
  const { status, step, payment, shipment, receipt, manualPayment, editable, canReturn } = state;
  const allowed = editable && status === 'PLACED' && !!payment;
  const next = allowed && !shipment && (payment.method === 'COD' || payment.status === 'PAID') ? nextFulfillment[step] : undefined;
  const track: HybridTrackingStep[] = [];
  if (allowed && step === 'SHIPPED' && (shipment?.status === 'IN_TRANSIT' || shipment?.status === 'OUT_FOR_DELIVERY')) {
    if (shipment.status === 'IN_TRANSIT') track.push('OUT_FOR_DELIVERY');
    track.push('DELIVERED');
    if (canReturn && (payment.method !== 'COD' || payment.status === 'AWAITING_COLLECTION')) track.push('REFUSED');
  }
  return {
    next, track,
    receive: allowed && canReturn && step === 'SHIPPED' && shipment?.status === 'REFUSED' && !receipt &&
      (payment.method === 'COD' ? payment.status === 'VOIDED' : payment.status === 'PAID' && ['SSLCOMMERZ', 'BKASH', 'NAGAD', 'ROCKET'].includes(payment.method)),
    cancel: allowed && payment.status === 'AWAITING_COLLECTION' && ['UNFULFILLED', 'PACKING', 'READY_TO_SHIP'].includes(step),
    collect: allowed && payment.method === 'COD' && payment.status === 'AWAITING_COLLECTION' && step === 'DELIVERED' &&
      (!shipment || shipment.status === 'DELIVERED'),
    manualPayment: allowed && step === 'UNFULFILLED' && payment.status === 'AWAITING_VERIFICATION' ? manualPayment : null,
  };
}
