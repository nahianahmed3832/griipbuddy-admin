import Link from 'next/link';
import { api, ApiError, mongoId, url, type Session } from '@/lib/api';
import { dateParam, param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { orderDate, orderNumber, ordersPath } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { Table } from './tables';

type Choice = { value: string; label: string };
type Assignment = {
  _id: string; order: { _id: string; order_serial_id: number; invoice_number?: string; status: string };
  location: { name?: string; business_location_name?: string }; createdAt?: string;
};
export async function AssignedOrders({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'order.view')) throw new ApiError(403);
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
