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
export const manualStatuses = ['PLACED', 'ACCEPTED', 'PROCESSING', 'INCOMPLETE', 'NO_RESPONSE', 'PRE_ORDER'];
export const orderFilterKeys = ['q', 'sku', 'from', 'to', 'location', 'creator', 'called', 'filter'] as const;
export type OrderFilters = Partial<Record<typeof orderFilterKeys[number], string>>;
export type Address = { address?: string; thana?: string; district?: string; division?: string; city?: string; state?: string; postal_code?: string; country?: string };
export type OrderItem = {
  name?: string; sku?: string; quantity?: number; image?: string; unitPrice?: number; snapshotUnitPrice?: number;
  amount?: number; attributes?: string[]; barcodes?: string[];
};
export type Variant = {
  id: string; product: string; name: string; sku: string; attributes?: Record<string, string>; image?: string;
  price: number; stock: number; regularPrice?: number; salePrice?: number;
};
export type Order = {
  _id: string; order_serial_id: number; invoice_number?: string; status: string; order_date?: string; createdAt?: string;
  customer_name?: string; customer_phone?: string; delivery_address?: Address; order_note?: string;
  currency?: string; COD?: number; paid_amount?: number; paid_by_courier?: number; total_amount?: number; products: OrderItem[];
  order_by?: string; user?: { full_name?: string; role?: string }; assigned_business_location?: { _id?: string; name?: string; business_location_name?: string };
  is_called?: boolean; latestCall?: { called_by_name?: string; called_at?: string }; latestNote?: string;
  tracking_code?: string; consignment_id?: number; transfer_to_courier?: boolean; managed?: boolean; scanReturn?: boolean;
  checkoutProjection?: boolean; assigned?: boolean;
};
export type OrderNote = { text?: string; at?: string; by?: string };
export type OrderDetail = Order & {
  sub_total?: number; total_discount?: number; delivery_charge?: number; tax?: number; payment_type?: string;
  payment?: { amount?: number; date?: string; reference?: string; status?: string };
  notes: OrderNote[]; activity: OrderNote[];
  statusHistory: { status?: string; at?: string; by?: string }[];
  discounts: { type?: string; amount?: number; at?: string }[];
};
export type WebsiteOrderDraft = {
  id: string; revision: string; serial: number; customer_name?: string; customer_phone?: string;
  delivery_address?: Address; order_note?: string; payment_type: 'CASH_ON_DELIVERY' | 'FULL_PAYMENT';
  delivery_charge: number; paid_amount: number; total_discount: number; paymentLocked: boolean; proofPresent: boolean;
  sender?: string; reference?: string; products: (Variant & { quantity: number; discountAmount?: number; discountType?: 'FLAT' | 'PERCENTAGE' })[];
};
export type OrderAccess = { update: boolean; fraud: boolean; return: boolean; pick: boolean; handover: boolean; dispatch: boolean; delete: boolean; product: boolean };
export type OrderLocation = { value: string; label: string };
export type OrderMutation = 'edit' | 'update-status' | 'note' | 'sms' | 'pick' | 'dispatch' | 'handover'
  | 'delivered' | 'return' | 'pending-return' | 'cancel' | 'called' | 'delete' | 'accept-stock' | 'decline-stock' | 'accept';
export type OrderAction = { kind: OrderMutation; label: string; group: 'Order' | 'Fulfillment' | 'Exceptions' };

export function orderActions(order: Order, access: OrderAccess, region: Region): OrderAction[] {
  if (order.checkoutProjection) return [];
  const actions: OrderAction[] = [];
  const add = (kind: OrderMutation, label: string, group: OrderAction['group'] = 'Order') => actions.push({ kind, label, group });
  const bd = region === 'BD';
  const legacy = bd && !order.managed;
  const beforeDispatch = legacy && !order.transfer_to_courier && openStatuses.includes(order.status);
  const editable = access.update && beforeDispatch;
  const shipped = legacy && order.transfer_to_courier && courierStatuses.includes(order.status);
  if (editable && order.status === 'PLACED') add('accept', 'Accept Order');
  if (editable && order.status === 'AWAITING_STOCK') {
    add('accept-stock', 'Accept Order');
    add('decline-stock', 'Decline Order');
  }
  if (editable) {
    add('edit', 'Edit Order');
    add('update-status', 'Update Status');
  }
  if (access.update) add('note', 'Update Note');
  if (access.update && bd && order.customer_phone) add('sms', 'Send SMS');
  if (legacy && access.pick && ['PLACED', 'ACCEPTED', 'PROCESSING'].includes(order.status) && !order.transfer_to_courier)
    add('pick', 'Assign Barcodes', 'Fulfillment');
  if (legacy && access.dispatch && !order.transfer_to_courier && !order.consignment_id && ['PLACED', 'ACCEPTED', 'PROCESSING'].includes(order.status))
    add('dispatch', 'Send to Courier', 'Fulfillment');
  if (shipped && access.handover && order.status === 'IN_REVIEW' && order.consignment_id && order.assigned_business_location?._id)
    add('handover', 'Mark as Handed Over', 'Fulfillment');
  if (shipped && access.update) add('delivered', 'Mark as Delivered', 'Fulfillment');
  if (access.update && legacy && pendingStatuses.includes(order.status)) add('pending-return', 'Mark as Pending Return', 'Exceptions');
  if (access.return && legacy && ['ACCEPTED', 'PROCESSING', 'IN_REVIEW', 'DELIVERED', 'PENDING_RETURN', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'PARTIAL', 'RETURN_REQUESTED', 'AWAITING_STOCK'].includes(order.status))
    add('return', 'Return Order', 'Exceptions');
  if (legacy && access.delete && !order.tracking_code && !order.consignment_id && !order.transfer_to_courier &&
      !order.paid_amount && ['FAILED', 'INCOMPLETE'].includes(order.status)) add('delete', 'Delete Order', 'Exceptions');
  if (editable && order.status !== 'INCOMPLETE') add('cancel', 'Cancel Order', 'Exceptions');
  return actions;
}

export function orderListQuery(region: Region, filters: OrderFilters = {}, page?: string) {
  const query = new URLSearchParams({ region });
  for (const key of orderFilterKeys) if (filters[key]) query.set(key, filters[key]);
  if (page && /^\d{1,5}$/.test(page)) query.set('page', page);
  return '?' + query;
}
export type Listing = { rows: Order[]; counts: Record<string, number>; total: number; page: number; size: number; hybridUnavailable?: boolean };
export type ProductListing = { rows: Variant[]; total: number; page: number; size: number };
export type CustomerHistory = {
  name?: string; phone?: string; orders: Order[];
  totals: { _id: string; orders: number; value: number; cod: number; paid: number }[]; total: number; page: number; size: number;
};
export const orderNumber = (order: Pick<Order, 'order_serial_id' | 'invoice_number'>) => order.order_serial_id ? '#' + order.order_serial_id : order.invoice_number || 'Order';
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
export const canSync = (order: Order) => !order.checkoutProjection && !order.managed && order.transfer_to_courier === true && !!order.tracking_code && courierStatuses.includes(order.status);

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
