export type CounterScope = {
  location: string;
  market: 'BD' | 'US';
  currency: 'BDT' | 'USD';
};

export type CounterContext = CounterScope & {
  organization: string;
  outletName: string;
  operator: string;
  operatorName: string;
  businessName: string;
  registerLabel?: string | null;
  policyRevision: number;
  shiftRequired: boolean;
};

export type CounterItem = {
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  barcode?: string;
  attributes?: string | Record<string, string>;
  unitMinor: number;
  currency: CounterScope['currency'];
  available: number;
};

export type CounterCustomer = { id: string; name: string; phone: string };
export type CounterLine = { productId: string; variantId: string; quantity: number };
export type CounterSelection = CounterScope & { lines: CounterLine[]; customerId?: string; coupon?: string };
export type CounterTotals = {
  currency: CounterScope['currency'];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export type CounterPricedLine = CounterLine & {
  name: string;
  sku: string;
  unitMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  available?: number;
};

export type CounterQuote = CounterTotals & { token: string; expiresAt: string; lines: CounterPricedLine[] };
export type CounterTender = { kind: 'cash'; receivedMinor: number; appliedMinor: number; changeMinor: number };
export type CounterReceipt = {
  id: string;
  invoice: string;
  at: string;
  context: CounterContext;
  lines: CounterPricedLine[];
  totals: CounterTotals;
  tender: CounterTender;
  customer?: { name: string } | null;
};
export type CounterHistoryRow = Omit<CounterReceipt, 'lines' | 'customer'> & { lineCount: number };
export type CounterSaleInput = CounterSelection & {
  operationId: string;
  quoteToken: string;
  tender: { kind: 'cash'; receivedMinor: number };
  shift?: string;
};
export type CounterOperation = { state: 'completed'; receipt: CounterReceipt } | { state: 'not-recorded' | 'sealed' };

export type CounterShift = {
  id: string;
  registerLabel: string;
  status: 'OPEN' | 'CLOSED';
  openedBy: string;
  openedAt: string;
  revision: number;
  openingMinor: number;
  salesMinor: number;
  refundsMinor: number;
  cashInMinor: number;
  cashOutMinor: number;
  expectedMinor: number;
  countedMinor?: number;
  differenceMinor?: number;
  reviewedAt?: string;
};
export type CounterShifts = { active: CounterShift | null; shifts: CounterShift[]; canManageCash: boolean };

export type CounterReturned = {
  id: string;
  status: 'AUTHORIZED' | 'INSPECTED' | 'REFUNDED' | 'CANCELLED' | 'COMPLETED_NO_REFUND';
  refundMinor: number;
  lines: { variantId: string; quantity: number; sellable?: number; damaged?: number }[];
};
export type CounterReturns = {
  saleId: string;
  invoice: string;
  currency?: CounterScope['currency'];
  totalMinor: number;
  canRefund: boolean;
  lines: { variantId: string; name: string; sku: string; purchased: number; available: number }[];
  returns: CounterReturned[];
};

export const counterCreatePath = '/dashboard/pos/create';
export const counterHistoryPath = '/dashboard/pos/counter-sales';
export const counterReceiptPath = '/dashboard/pos/counter-receipt';
export const counterDeskReceipts = '/desk/pos/counter-receipt';

export function counterScopeFields({ location, market, currency }: CounterScope): CounterScope {
  return { location, market, currency };
}

export function counterContextKey(scope: CounterScope) {
  return [scope.location, scope.market, scope.currency].join(':');
}

export function counterReceiptUrl(path: string, receipt: Pick<CounterReceipt, 'id' | 'context'>) {
  const query = new URLSearchParams(counterScopeFields(receipt.context));
  if (receipt.context.market === 'US') query.set('region', 'INTERNATIONAL');
  return path + '/' + encodeURIComponent(receipt.id) + '?' + query.toString();
}

export function counterMoney(minor: number, currency: CounterScope['currency']) {
  return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' }).format(minor / 100);
}

export function counterMinor(value: string) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function counterDate(value: string, market: CounterScope['market']) {
  if (!Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: market === 'BD' ? 'Asia/Dhaka' : 'America/New_York',
  }).format(new Date(value));
}

export function counterDescription(attributes?: CounterItem['attributes']) {
  return typeof attributes === 'string' ? attributes : Object.values(attributes ?? {}).join(' · ');
}
