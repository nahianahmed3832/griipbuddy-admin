import { ApiError, requestApi, type Session } from './api';
import type { Region } from './sections';

export const operationsPath = '/desk/operations';
export const queuePath = operationsPath + '/queue';
export const codPath = operationsPath + '/cod';
export const metricDetails: Record<string, string> = {
  orderValue: 'Value at acceptance, after discounts and including recorded shipping and tax. Uses the saved acceptance timestamp and total.',
  captured: 'Provider-confirmed bKash, PayPal or Stripe capture activity by ledger timestamp.',
  due: 'Customer COD still expected at the current data cutoff, after evidenced collection. Cancelled and fully returned orders are excluded.',
  collected: 'Dated courier or operator-reported collection activity. An order marked delivered alone gives no collection evidence.',
  received: 'Recorded receipts by source timestamp. Verified and unverified amounts are shown separately.',
  refunded: 'Completed refund ledger activity by completion timestamp.',
  unmatched: 'Absolute balance discrepancies or unlinked source amounts by currency at the cutoff. Review the individual batches.',
};

export type History = { at: string; status: string; source?: string; method?: string };
export type Audit = { at: string; actor?: string; action: string; reason?: string; note?: string; reference?: string };
export type Issue = {
  _id: string; type: string; role: string; priority: number; order?: string; reference: string; status: string; startedAt: string;
  observedAt: string; observed: boolean; revision: number; reason?: string; assignee?: string; evidence?: Record<string, unknown>; audit?: Audit[];
  request?: { category: string; details?: string; stage: string; draft?: string; completion?: string };
};
export type Queue = { items: Issue[]; overflow: boolean; checked?: { checkedAt: string; gaps: string[] } };
export type Order = { id: string; reference: string; status: string; payment: string; currency: string; mode: string;
  shipment?: string; since: string; destination?: { city?: string; district?: string; country?: string };
  lines: { sku: string; quantity: number; picked: number }[] };
export type Lookup = Order & { codStatus?: string; trackingCode?: string; parcel?: string; history: History[]; tracking: History[];
  payments: History[]; canPlanShipment?: boolean; manualShipment?: { id: string; state: string } };
export type Money = { amount: string | null; records: number; missing: number; state: string; verified?: string; unverified?: string };
export type Range = { from: string; to: string; timezone: string; cutoff: string };
export type Batch = { id: string; sources: string[]; first: string; refs: string[]; overdue: boolean;
  amounts: { currency: string; collection: string; fee: string; settlement: string; reportedSettlement?: string; unmatched: string; state: string; unverified: boolean }[] };
export type Overview = { range: Range; config: Record<string, number>; metrics: Record<string, string>;
  currencies: { currency: string; metrics: Record<string, Money> }[]; batches: Batch[]; totalBatches: number; gaps: string[];
  coverage: Record<string, boolean>; checked: Queue['checked']; staging: boolean };
export type Access = { purchasing?: import('./purchasing').PurchaseAccess; owner: boolean; pack: boolean; support: boolean; warehouseAssigned: boolean; staging: boolean; workforce?: boolean };
export type Policy = { id: string; title: string; description: string; days: number; conditions: string[]; updatedAt: string };
export type CodEntry = { _id: string; kind: string; courier: string; reference: string; batch?: string; order?: string; orderReference?: string;
  amount: number; currency: string; occurredAt: string; status: string; evidence: string; revision: number; audit?: Audit[] };
export type AssistantKind = 'briefing' | 'explanation' | 'draft';
export type AssistantStatus = { available: boolean; scheduling: string; retryLimit: number; model?: string;
  failure?: { error: string; finishedAt: string }; success?: { model: string; finishedAt: string; cutoff: string; period: Range;
    output: { summary: string; suggested: string[]; gaps: string[]; sources: string[]; draft?: string } } };

export const issueLabels: Record<string, string> = {
  packing: 'Awaiting packing', 'payment-pending': 'Payment overdue', 'payment-failed': 'Payment failed', delivery: 'Delivery problem',
  'cod-batch': 'COD batch discrepancy', 'cod-collection': 'COD collection evidence', 'stock-low': 'Low stock',
  'purchase-overdue': 'Supplier delivery overdue', 'purchase-discrepancy': 'Receipt discrepancy',
  'purchase-reconciliation': 'Receipt correction needs reconciliation', 'purchase-quote-expired': 'Supplier quote expired',
  'stock-inconsistent': 'Stock inconsistency', support: 'Customer request',
};
export const label = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./, character => character.toUpperCase());

export function exactMoney(amount: string, currency: string) {
  const decimals = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const sign = amount.startsWith('-') ? '-' : '';
  const digits = amount.replace(/^-/, '').padStart(decimals + 1, '0');
  const integer = (decimals ? digits.slice(0, -decimals) : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return currency + ' ' + sign + integer + (decimals ? '.' + digits.slice(-decimals) : '');
}

export function opsDate(value: string | undefined, region: Region) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC',
    dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export async function opsApi<T>(auth: Session, region: Region, path: string, params?: Record<string, string | undefined>, body?: string) {
  const search = new URLSearchParams({ region });
  for (const [key, value] of Object.entries(params ?? {})) if (value) search.set(key, value);
  const res = await requestApi('/operations/' + path + '?' + search.toString(), auth.token, body === undefined ? undefined : { method: 'POST', body });
  const result = await res.json().catch(() => null);
  if (!res.ok || result?.success !== true) {
    const message = res.status >= 500 && path !== 'assistant' ? 'Operations data is temporarily unavailable.' :
      (typeof result?.message === 'string' ? result.message : 'The operations request could not be completed.');
    throw new ApiError(res.ok ? 502 : res.status, message);
  }
  return result.data as T;
}
