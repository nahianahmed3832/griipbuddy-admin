export type HybridFulfillmentStep = 'PACKING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED';
export type HybridTrackingStep = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'REFUSED';

export type HybridShipment = {
  status: 'IN_TRANSIT' | HybridTrackingStep;
  carrier: string;
  trackingReference: string;
  source: 'DEV_SIMULATOR' | 'MANUAL';
  events?: { status: string; recordedAt: string; evidence?: string | null }[];
};

export type HybridReturnCost = { amountMinor: number; evidenceReference?: string };
export type HybridReturnCostReceipt = { caseId?: string; receivedAt: string; quantity: number; cost?: HybridReturnCost | null };

export const hybridReturnReasons = {
  DELIVERY: 'Delivery', DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong item', CHANGED_MIND: 'Changed mind', PAYMENT: 'Payment', OTHER: 'Other',
};
export type HybridReturnStatus = 'IN_REVIEW' | 'RETURN_APPROVED' | 'DECLINED' | 'RESOLVED';
export type HybridReturnDisposition = 'RESTOCK' | 'HOLD';
export type HybridReturnLine = { orderItemId: string; quantity: number };
export type HybridReturnCase = {
  id: string; status: string; revision: number; reason?: string | null; createdAt: string;
  returnReceivedAt?: string | null; returnDisposition?: HybridReturnDisposition | null;
  refundAmountMinor?: number | null; refundConfirmedAt?: string | null;
  returnLines: HybridReturnLine[];
  events: { note?: string | null; refundConfirmed?: boolean; status: string; createdAt: string; actor: { name?: string | null } | null }[];
};
export type HybridOrderOperations = {
  updatedAt: string;
  items: { id: string; productName: string; variantName: string; sku: string; quantity: number }[];
  cases: HybridReturnCase[];
};

export type HybridFulfillment = {
  status: string;
  step: string;
  payment: { method: string; status: string; amountMinor: number } | null;
  shipment: HybridShipment | null;
  receipt: { receivedAt: string; disposition: 'RESTOCK' | 'HOLD'; restockedUnits: number; note?: string; returnCost?: HybridReturnCost | null } | null;
  manualPayment: { transaction: string | null } | null;
  editable: boolean;
  operations?: HybridOrderOperations;
  canReturn: boolean;
  shippingWarehouse?: string;
  warehouseChoices?: { value: string; label: string }[];
  canRecordReturnCost?: boolean;
  returnCostReceipts?: HybridReturnCostReceipt[];
};

export type HybridCommand =
  | { action: 'edit-contact'; name: string; phone: string; address: string; revision: string }
  | { action: 'add-note'; note: string; key: string }
  | { action: 'open-return'; reason: keyof typeof hybridReturnReasons; note: string; lines: HybridReturnLine[] }
  | { action: 'review-return'; caseId: string; revision: number; status: HybridReturnStatus; note: string }
  | { action: 'receive-return'; caseId: string; revision: number; disposition: HybridReturnDisposition; confirmed: boolean }
  | { action: 'confirm-return-refund'; caseId: string; revision: number; amountMinor: number; method: string; reference: string; confirmed: boolean }
  | { action: 'record-return-cost'; caseId?: string; amountMinor: number; evidence: string }
  | { action: 'advance'; next: HybridFulfillmentStep; carrier?: string; trackingReference?: string; simulate?: boolean; warehouseId?: string }
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
