import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { ApiError, arr, canWrite, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { canManage } from '@/lib/managed';
import { canReadHybridReports, hybridReportLocations, loadWebsiteOrders } from '@/lib/hybrid-orders';
import { canEditManagedOrderContact, managedOrderContext } from '@/lib/order-managed-server';
import { has } from '@/lib/sections';
import { addressLabel, orderFilterKeys, type Listing } from '@/lib/website-orders';

const root = '/order/workspace';
const reads = ['history', 'status', 'tracking', 'payment', 'proof', 'notes', 'detail', 'calls', 'sms-history', 'return-items'];
const actions: Record<string, { path: string; method: string }> = {
  'accept-stock': { path: '/accept-stock', method: 'PATCH' },
  'decline-stock': { path: '/decline-stock', method: 'PATCH' },
  delete: { path: '', method: 'DELETE' },
  called: { path: '/called', method: 'PATCH' },
  edit: { path: '/details', method: 'PATCH' },
  draft: { path: '/draft', method: 'PATCH' },
  note: { path: '/note', method: 'PUT' },
  sms: { path: '/sms', method: 'POST' },
  'update-status': { path: '/status', method: 'PATCH' },
  fraud: { path: '/fraud', method: 'POST' },
  'return-untracked': { path: '/return', method: 'POST' },
  dispatch: { path: '/dispatch', method: 'POST' },
  handover: { path: '/handover', method: 'POST' },
};
const reject = (message: string, status: number) => new Response(message, { status, headers: { 'Cache-Control': 'private, no-store' } });
function workbook({ rows }: Listing) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Order', 'Invoice', 'Date', 'Status', 'SKUs and quantities', 'Customer', 'Phone', 'Address', 'Currency', 'COD',
      'Paid by courier', 'Total paid', 'Order total', 'Called', 'Staff note', 'Parcel ID', 'Tracking code', 'Created by'],
    ...rows.map(row => [row.order_serial_id || undefined, row.invoice_number, row.order_date || row.createdAt, row.status,
      row.products.map(line => `${line.sku || line.name || 'Item'} × ${line.quantity || 0}`).join(', ').slice(0, 30000),
      row.customer_name, row.customer_phone, addressLabel(row.delivery_address), row.currency,
      row.COD, row.paid_by_courier, row.paid_amount, row.total_amount, row.checkoutProjection ? undefined : row.is_called ? 'Yes' : 'No',
      row.latestNote, row.consignment_id || undefined, row.tracking_code, row.user?.full_name || row.order_by]),
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Website Orders');
  return new Response(XLSX.write(book, { bookType: 'xlsx', type: 'buffer', compression: true }), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="website-orders.xlsx"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
async function forward(path: string, token: string, init?: RequestInit, attachment?: string, resource = root) {
  const response = await requestApi(resource + path, token, init);
  if (!response.ok) {
    const data = obj(await response.json().catch(() => ({})));
    const error = str(data.message);
    return reject(response.status >= 500
      ? ((/\/(?:fraud|fraud-check)(?:\?|$)/.test(path)) ? 'Courier fraud check is unavailable.' : 'The order service did not confirm the request. Check the order before retrying.')
      : error.slice(0, 320) || 'The order service could not complete this request.', response.status);
  }
  if (attachment || response.headers.get('content-type')?.startsWith('image/png')) {
    return new Response(response.body, { headers: {
      'Content-Type': attachment ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'image/png',
      ...(attachment && { 'Content-Disposition': 'attachment; filename="website-orders.xlsx"' }),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  }
  if (resource === '/order') return Response.json({}, { headers: { 'Cache-Control': 'private, no-store' } });
  return Response.json(obj(await response.json()).data, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const q = request.nextUrl.searchParams;
  const action = q.get('action') || '';
  const id = q.get('id') || '';
  try {
    const region = getRegion(q.get('region') || undefined, auth.staff);
    if (action === 'products' || action === 'draft-products') {
      const browse = action === 'products' ? has(auth.staff, 'order.create') : has(auth.staff, 'order.view') && has(auth.staff, 'order.update');
      if (region !== 'BD' || !canWrite(auth.staff) || !browse || !has(auth.staff, 'product.view')) return reject('Access denied.', 403);
      return await forward(url('/' + action, { region, page: q.get('page') || undefined, q: q.get('q')?.slice(0, 100),
        barcode: q.get('barcode')?.slice(0, 64) }), auth.token);
    }
    if (!has(auth.staff, 'order.view')) return reject('Access denied.', 403);
    if (action === 'export') {
      const filters = Object.fromEntries(orderFilterKeys.map(key => [key, q.get(key)?.slice(0, 100)]));
      if (q.get('checkout') === '1' && canReadHybridReports(auth, region)) filters.location = hybridReportLocations(auth, filters.location);
      const listing = q.get('checkout') === '1' ? await loadWebsiteOrders(auth, region, filters, undefined, 'all', { exportOrders: true }) : null;
      return listing ? workbook(listing) : await forward(url('/export', { region, ...filters }), auth.token, undefined, 'xlsx');
    }
    if (action === 'return-items' && !has(auth.staff, 'order.return')) return reject('Access denied.', 403);
    if (!reads.includes(action) || !mongoId(id)) return reject('Order request not found.', 404);
    return await forward(url('/orders/' + id + (action === 'detail' ? '' : '/' + action), { region, page: q.get('page') || undefined }), auth.token);
  } catch (error) {
    return reject('The order request could not be completed.', error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  if (!canWrite(auth.staff)) return reject('This workspace is read-only.', 403);
  const q = request.nextUrl.searchParams;
  const action = q.get('action') || '';
  const id = q.get('id') || '';
  const limit = action === 'create' || action === 'draft' ? 2_150_000 : 15_000;
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > limit) {
    return reject('Invalid order request.', 400);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > limit) return reject('Order request is too large.', 413);
  let body: Record<string, unknown>;
  try { body = obj(JSON.parse(raw)); } catch { return reject('Invalid order request.', 400); }
  try {
    const region = getRegion(q.get('region') || undefined, auth.staff);
    let path: string;
    let method = 'POST';
    if (action === 'create') {
      if (!has(auth.staff, 'order.create') || !has(auth.staff, 'product.view')) return reject('Access denied.', 403);
      path = '/orders';
    } else if (action === 'edit-managed') {
      if (region !== 'BD' || !canManage(auth.staff) || !has(auth.staff, 'order.view') || !has(auth.staff, 'order.update')) return reject('Access denied.', 403);
      if (!mongoId(id)) return reject('Order not found.', 404);
      const context = await managedOrderContext(id, auth);
      if (!canEditManagedOrderContact(context)) return reject('This order is already in fulfillment.', 409);
      const { order } = context;
      const customer_name = str(body.customer_name).trim();
      const customer_phone = str(body.customer_phone).trim();
      const order_note = str(body.order_note).trim();
      const address = str(obj(body.delivery_address).address).trim();
      if (!customer_name || customer_name.length > 120 || !/^(?:\+?88)?01\d{9}$/.test(customer_phone) ||
          order_note.length > 1000 || !address || address.length > 450) return reject('Check the contact and address fields.', 400);
      const location = obj(order.delivery_address);
      const lineDiscount = arr(order.products).reduce<number>((sum, line) => sum + (Number(obj(line).total_discount) || 0), 0);
      const discount = Math.max(0, (Number(order.total_discount) || 0) - lineDiscount);
      return await forward('/' + id, auth.token, { method: 'PUT', body: JSON.stringify({
        customer_name, customer_phone, order_note, delivery_address: {
          address, division: str(location.division), district: str(location.district), thana: str(location.thana),
        }, sub_total: order.sub_total, payment_type: order.payment_type, paid_amount: order.paid_amount || 0,
        overall_discount_amount: discount, ...(discount && { overall_discount_type: 'FLAT' }),
      }) }, undefined, '/order');
    } else if (action === 'fraud-check') {
      if (process.env.GRIIP_ADMIN_FRAUD_LOOKUP !== '1') return reject('Courier history lookup is disabled in this workspace.', 503);
      if (region !== 'BD' || !has(auth.staff, 'order.view')) return reject('Access denied.', 403);
      if (!/^01\d{9}$/.test(str(body.phone))) return reject('Enter an 11-digit Bangladesh mobile number.', 400);
      path = '/fraud-check';
    } else {
      const permission = action === 'fraud' ? 'order.view' : action === 'delete' ? 'order.delete' : 'order.update';
      if (!has(auth.staff, 'order.view') || !has(auth.staff, permission)
        || action === 'draft' && (region !== 'BD' || !has(auth.staff, 'product.view'))
        || action === 'return-untracked' && !has(auth.staff, 'order.return')
        || action === 'dispatch' && !has(auth.staff, 'business_locations.view')
        || action === 'handover' && !has(auth.staff, 'courier.update')) return reject('Access denied.', 403);
      if (action === 'sync') path = '/sync';
      else {
        if (!mongoId(id) || !Object.hasOwn(actions, action)) return reject('Order action not found.', 404);
        path = '/orders/' + id + actions[action].path;
        method = actions[action].method;
      }
    }
    return await forward(url(path, { region }), auth.token, { method, body: JSON.stringify(body) });
  } catch (error) {
    return reject(error instanceof ApiError && error.status === 403 ? 'Access denied.'
      : 'The connection was interrupted. Check the order before retrying.', error instanceof ApiError ? error.status : 503);
  }
}
