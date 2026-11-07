import { adminPath } from './paths';
import type { Region } from './sections';

export const ordersPath = '/desk/orders/orders';
export const statuses = ['PLACED', 'ACCEPTED', 'PROCESSING', 'IN_REVIEW', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT',
  'DELIVERED', 'PENDING_RETURN', 'PARTIAL', 'RETURN_REQUESTED', 'RETURNED', 'FULL_RETURNED', 'CANCELLED', 'FAILED',
  'INCOMPLETE', 'NO_RESPONSE', 'PRE_ORDER', 'AWAITING_STOCK', 'UNKNOWN'] as const;
export const statusLabel = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, s => s.toUpperCase());
export const openStatuses = ['PLACED', 'ACCEPTED', 'PROCESSING', 'IN_REVIEW', 'NO_RESPONSE', 'AWAITING_STOCK', 'PRE_ORDER', 'INCOMPLETE'];
export const courierStatuses = ['IN_REVIEW', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT'];
export const pendingStatuses = [...courierStatuses, 'DELIVERED', 'RETURN_REQUESTED'];
export const manualStatuses = ['PLACED', 'ACCEPTED', 'PROCESSING', 'NO_RESPONSE', 'PRE_ORDER'];
export const orderFilterKeys = ['q', 'sku', 'from', 'to', 'location', 'creator', 'called', 'filter'] as const;
export type OrderFilters = Partial<Record<typeof orderFilterKeys[number], string>>;
export type Address = { address?: string; thana?: string; district?: string; division?: string; city?: string; state?: string; postal_code?: string; country?: string };
export type OrderItem = { name?: string; sku?: string; quantity?: number; image?: string };
export type Variant = { id: string; product: string; name: string; sku: string; attributes?: Record<string, string>; image?: string; price: number; stock: number };
export type Order = {
  _id: string; order_serial_id: number; invoice_number?: string; status: string; order_date?: string; createdAt?: string;
  customer_name?: string; customer_phone?: string; delivery_address?: Address; order_note?: string;
  currency?: string; COD?: number; paid_amount?: number; paid_by_courier?: number; total_amount?: number; products: OrderItem[];
  order_by?: string; user?: { full_name?: string; role?: string }; assigned_business_location?: { name?: string; business_location_name?: string };
  is_called?: boolean; latestCall?: { called_by_name?: string; called_at?: string }; latestNote?: string;
  tracking_code?: string; consignment_id?: number; transfer_to_courier?: boolean; managed?: boolean; scanReturn?: boolean;
};
export type Listing = { rows: Order[]; counts: Record<string, number>; total: number; page: number; size: number };
export type ProductListing = { rows: Variant[]; total: number; page: number; size: number };
export type CustomerHistory = {
  name?: string; phone?: string; orders: Order[];
  totals: { _id: string; orders: number; value: number; cod: number; paid: number }[]; total: number; page: number; size: number;
};
export const orderNumber = (order: Order) => order.order_serial_id ? '#' + order.order_serial_id : order.invoice_number || 'Order';
export const currencyFor = (value: string | undefined, region: Region) => value || (region === 'BD' ? 'BDT' : 'USD');
export function money(amount: number | undefined, currency: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  if (currency === 'BDT') return (amount < 0 ? '-৳' : '৳') + Math.abs(amount).toLocaleString('en-BD', { maximumFractionDigits: 2 });
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount); }
  catch { return amount.toLocaleString('en'); }
}
export function orderDate(value: string | undefined, region: Region) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short',
    timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC', hour12: true }).format(new Date(value));
}
export function addressLabel(address?: Address) {
  return [...new Set([address?.address, address?.thana, address?.district, address?.division,
    address?.city, address?.state, address?.postal_code, address?.country].filter(Boolean))].join(', ');
}
export const canSync = (order: Order) => !order.managed && order.transfer_to_courier === true && !!order.tracking_code && courierStatuses.includes(order.status);

export function ordersApi(action: string, region: Region, values: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams({ action, region });
  for (const [name, value] of Object.entries(values)) if (value) q.set(name, value);
  return adminPath('/api/website-orders?' + q);
}

export async function orderRequest<T>(action: string, region: Region, options: {
  query?: Record<string, string | undefined>; values?: object; signal?: AbortSignal;
} = {}): Promise<T> {
  const response = await fetch(ordersApi(action, region, options.query), {
    ...(options.values && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.values) }),
    signal: options.signal, cache: 'no-store',
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 360) || 'The order request failed.');
  return response.json();
}
