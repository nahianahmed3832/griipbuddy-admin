import Link from 'next/link';
import { api, ApiError, arr, mongoId, obj, str, url, type Session } from '@/lib/api';
import { dateParam, param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { orderDate, orderNumber, ordersPath, statuses, type Listing, type Order } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { ProductionWebsiteOrders } from './production-website-orders';
import { Table } from './tables';
import { accessFor } from './website-orders-page';

type Choice = { value: string; label: string };
type Assignment = {
  _id: string; order: { _id: string; order_serial_id: number; invoice_number?: string; status: string };
  location: { name?: string; business_location_name?: string }; createdAt?: string;
};
const productionPageSizes = ['20', '40', '60', '80', '100'];
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function assignmentOrder(value: unknown): Order {
  const row = obj(value);
  const user = obj(row.user);
  const location = obj(row.assigned_business_location);
  const called = obj(arr(row.call_logs).at(-1));
  const note = obj(arr(row.admin_notes).at(-1));
  return {
    _id: str(row._id), order_serial_id: number(row.order_serial_id) ?? 0, invoice_number: str(row.invoice_number), status: str(row.status),
    order_date: str(row.order_date), createdAt: str(row.createdAt), customer_name: str(row.customer_name), customer_phone: str(row.customer_phone),
    delivery_address: Object.fromEntries(['address', 'district', 'thana', 'division', 'state', 'city', 'country', 'postal_code']
      .map(key => [key, str(obj(row.delivery_address)[key])])),
    order_note: str(row.order_note), currency: str(row.currency), COD: number(row.COD), paid_amount: number(row.paid_amount),
    paid_by_courier: number(row.paid_by_courier), total_amount: number(row.total_amount),
    tracking_code: str(row.tracking_code), consignment_id: number(row.consignment_id), transfer_to_courier: row.transfer_to_courier === true,
    is_called: row.is_called === true, latestCall: { called_by_name: str(called.called_by_name), called_at: str(called.called_at) },
    latestNote: str(note.note), order_by: str(row.order_by), user: { full_name: str(user.full_name), role: str(user.role) },
    assigned_business_location: { _id: str(location._id), name: str(location.name), business_location_name: str(location.business_location_name) },
    products: arr(row.products).map(obj).map(line => ({ name: str(obj(line.product).name), sku: str(obj(line.selected_variant).sku),
      image: str(obj(line.selected_variant).image) || str(obj(line.product).thumbnail), quantity: number(line.total_quantity) })),
  };
}

async function productionAssigned({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  const location = param(q, 'location') ?? '';
  const status = param(q, 'filter') ?? param(q, 'status');
  const filter = statuses.find(value => value === status);
  const filters = { q: param(q, 'q')?.trim().slice(0, 100), sku: param(q, 'sku')?.trim().slice(0, 100),
    location: mongoId(location) ? location : undefined, from: dateParam(param(q, 'from')), to: dateParam(param(q, 'to')), filter };
  const pageValue = param(q, 'page') ?? '';
  const page = /^\d{1,5}$/.test(pageValue) ? Math.max(1, Number(pageValue)) : 1;
  const limit = productionPageSizes.find(value => value === param(q, 'limit')) ?? '20';
  const scope = { startDate: filters.from, endDate: filters.to, business_location_id: filters.location };
  const [data, tally, locations] = await Promise.all([
    api(url('/order', { ...scope, region, page: String(page), limit, searchQuery: filters.q, sku: filters.sku, filter,
      is_assigned_to_business_location: 'true' }), auth.token).then(obj),
    api(region === 'BD' ? url('/assigned-orders/status/count', scope)
      : url('/order/status/count', { ...scope, region, is_assigned_to_business_location: 'true' }), auth.token).then(obj),
    has(auth.staff, 'business_locations.view') ? api(url('/order/workspace/locations', { region }), auth.token) as Promise<Choice[]> : [],
  ]);
  const rows = arr(data.data).map(assignmentOrder).filter(row => mongoId(row._id));
  const counts = Object.fromEntries(Object.entries(tally).filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => [key.toUpperCase(), Number(value)]));
  const listing: Listing = { rows, counts, total: number(obj(data.meta).total) ?? rows.length, page, size: Number(limit) };
  return <ProductionWebsiteOrders key={region} assigned listing={listing} filters={filters} region={region} locations={locations}
    creators={[]} access={accessFor(auth, region)} pageSizes={productionPageSizes} selectedSize={limit}/>;
}

export async function AssignedOrders({ auth, region, q, productionLayout = false }: { auth: Session; region: Region; q: Query; productionLayout?: boolean }) {
  if (!has(auth.staff, 'order.view')) throw new ApiError(403);
  if (productionLayout) return productionAssigned({ auth, region, q });
  const path = '/desk/orders/assigned';
  const location = param(q, 'location') || '';
  const filters = { region, q: param(q,'q')?.trim().slice(0,100), sku: param(q,'sku')?.trim().slice(0,100),
    location: mongoId(location) ? location : undefined, from: dateParam(param(q,'from')), to: dateParam(param(q,'to')) };
  const [listing, locations] = await Promise.all([
    api(url('/order/workspace/assignments', { ...filters, page: param(q,'page') }), auth.token) as Promise<{ rows: Assignment[]; total: number; page: number; limit: number }>,
    has(auth.staff,'business_locations.view') ? api(url('/order/workspace/locations', {region}), auth.token) as Promise<Choice[]> : [],
  ]);
  const columns = ['Order', 'Location', 'Status', 'Assigned on'].map(label => ({label, fields:''}));
  const rows = listing.rows.map(row => ({ id:row._id, href:url(ordersPath + '/' + row.order._id, {region}),
    values:[orderNumber(row.order), row.location.name || row.location.business_location_name || '',
      row.order.status, orderDate(row.createdAt, region)] }));
  return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title="Assigned orders" description="Find orders assigned to your operating region’s outlets and warehouses."/>
    <form className="panel filters" action={adminPath(path)}>
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">Order, customer phone or tracking<input type="search" name="q" defaultValue={filters.q} maxLength={100}/></label>
      <label className="filter-label">SKU<input type="search" name="sku" defaultValue={filters.sku} maxLength={100}/></label>
      {!!locations.length && <label className="filter-label">Location<select name="location" defaultValue={filters.location ?? ''}>
        <option value="">Any location</option>{locations.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>}
      <label className="filter-label">From<input type="date" name="from" defaultValue={filters.from}/></label>
      <label className="filter-label">To<input type="date" name="to" defaultValue={filters.to}/></label>
      <button className="button primary">Apply filters</button><Link className="button subtle" href={url(path,{region})}>Reset</Link>
    </form>
    <Table title="Assignment history" columns={columns} rows={rows} total={listing.total} page={listing.page} exportable={false}
      previous={listing.page > 1 ? url(path,{...filters,page:String(listing.page-1)}) : undefined}
      next={listing.page*listing.limit < listing.total ? url(path,{...filters,page:String(listing.page+1)}) : undefined}/>
  </>;
}
