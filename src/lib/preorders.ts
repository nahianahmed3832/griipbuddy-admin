import { adminPath } from './paths';

export const preOrdersPath = '/desk/orders/preorders';
export const productionPreOrdersPath = '/dashboard/pre-orders';
export const productionPreOrderSizes = [20, 40, 60, 80, 100] as const;
export const preOrderActionStatus = 'ACTION_REQUIRED';
export const preOrderStatuses = [
  'REQUESTED', 'QUOTED', 'CONFIRMED', 'PURCHASED', 'SHIPPED_TO_BD', 'ARRIVED_IN_BD',
  'READY_FOR_DELIVERY', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED', 'ON_HOLD',
] as const;
export const outboundPreOrderStatuses = preOrderStatuses.slice(6, 10);
export const inboundPreOrderStatuses = preOrderStatuses.slice(0, 6);
export const preOrderFilterKeys = ['q', 'status', 'batch', 'source', 'creator', 'from', 'to', 'sort'] as const;
export type FilterKey = typeof preOrderFilterKeys[number];
export type PreOrderFilters = Partial<Record<FilterKey, string>>;
export type NumberedFilters = PreOrderFilters & { page?: string };
export type Address = { address?: string; division?: string; district?: string; thana?: string };
type Staff = { _id?: string; full_name?: string; role?: string | { name?: string } };
export type PreOrderItem = {
  source_type: 'EXTERNAL' | 'LISTED';
  product?: string | { _id?: string; name?: string; thumbnail?: string } | null;
  product_name?: string;
  product_image?: string;
  reference?: { product_name?: string; product_link?: string; images?: string[]; color?: string; size?: string; notes?: string };
  variant?: { sku?: string; image?: string; attribute_values?: Record<string, string> };
  quantity?: number;
  unit_price?: number;
  quoted_unit_price?: number;
  quoted_total?: number;
};
export type PreOrderRow = PreOrderItem & {
  _id: string;
  pre_order_serial_id?: number;
  invoice_number?: string;
  createdAt?: string;
  status?: string;
  items?: PreOrderItem[];
  customer_name?: string;
  customer_phone?: string;
  customer_secondary_phone?: string;
  customer_email?: string;
  customer_note?: string;
  delivery_address?: Address;
  order_by?: string;
  created_by?: Staff;
  batch?: string;
  is_called?: boolean;
  quoted_total?: number;
  delivery_charge?: number;
  total_amount?: number;
  advance_amount?: number;
  advance_paid?: boolean;
  paid_amount?: number;
  due_amount?: number;
  advance_payment_info?: { method?: string; sender_number?: string; trxId?: string; paid_amount?: number; files?: string[]; received_at?: string; received_by?: Staff };
  courier_note?: string;
  tracking_code?: string;
  consignment_id?: number;
  transfer_to_courier?: boolean;
  estimated_delivery_time?: string;
  payment_receipts?: { _id?: string; file?: string; amount?: number; method?: string; note?: string; uploaded_at?: string; uploaded_by_name?: string; uploaded_by?: Staff }[];
  status_history?: { _id?: string; status?: string; changed_at?: string; changed_by?: Staff | string }[];
  logs?: { _id?: string; action?: string; time?: string }[];
  call_logs?: { _id?: string; called_at?: string; called_by_name?: string; called_by?: Staff }[];
  sms_logs?: { _id?: string; message?: string; status?: string; sent_at?: string; sent_by_name?: string }[];
  admin_notes?: { _id?: string; note?: string; added_at?: string; added_by?: Staff }[];
};
export type Products = { id: string; name: string; sku: string; image?: string; price?: number; attributes?: Record<string, string> }[];

export function preOrderMedia(value: string | undefined, origin: string, allowExternal = false) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password &&
      (allowExternal || parsed.origin === origin)) return parsed.href;
    return undefined;
  } catch {
    const path = value.replace(/^\//, '');
    if (!origin || !/^(?:[a-z\d_-]+\/)+[a-z\d_.-]+$/i.test(path) || path.split('/').some(part => ['.', '..'].includes(part))) return undefined;
    return origin + '/' + path;
  }
}

export function preOrderQuery(params: URLSearchParams | PreOrderFilters): PreOrderFilters {
  const get = (key: FilterKey) => params instanceof URLSearchParams ? params.get(key) ?? '' : params[key] ?? '';
  const status = get('status');
  const source = get('source');
  const creator = get('creator');
  const from = get('from');
  const to = get('to');
  return {
    q: get('q').trim().slice(0, 100) || undefined,
    status: status === preOrderActionStatus ? status
      : status.split(',').filter(value => (preOrderStatuses as readonly string[]).includes(value)).join(',') || undefined,
    batch: get('batch').trim().slice(0, 120) || undefined,
    source: source === 'EXTERNAL' || source === 'LISTED' ? source : undefined,
    creator: /^[a-f\d]{24}$/i.test(creator) ? creator : undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
    sort: get('sort') === 'asc' ? 'asc' : undefined,
  };
}

export function preOrderApiParams(filters: PreOrderFilters) {
  return {
    searchQuery: filters.q, status: filters.status, batch: filters.batch, source_type: filters.source,
    created_by: filters.creator, startDate: filters.from, endDate: filters.to, sortOrder: filters.sort,
  };
}

export function preOrderUrl(path: string, values: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.size ? path + '?' + params : path;
}

export function preOrderRequestUrl(action: string, values: Record<string, string | undefined> = {}) {
  return preOrderUrl(adminPath('/api/preorders'), { action, ...values });
}

export async function preOrderRequest<T>(action: string, values: Record<string, string | undefined>, body?: object): Promise<T> {
  const response = await fetch(preOrderRequestUrl(action, values), {
    ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 300) || 'The pre-order request failed.');
  return response.json();
}

export const preOrderNumber = (row: PreOrderRow) => row.invoice_number ?? (row.pre_order_serial_id ? '#' + row.pre_order_serial_id : 'Pre-order');
export const preOrderItems = (row: PreOrderRow) => row.items?.length ? row.items : [row];
export function preOrderProduct(item: PreOrderItem) {
  return item.reference?.product_name || item.product_name || (typeof item.product === 'object' && item.product?.name) || item.variant?.sku || 'Item';
}
export const statusText = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, initial => initial.toUpperCase());
