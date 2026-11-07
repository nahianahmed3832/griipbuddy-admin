import Link from 'next/link';
import { Download, Filter, Plus } from 'lucide-react';
import { api, ApiError, canWrite, mongoId, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { canOperate } from '@/lib/operations';
import { has, type Region } from '@/lib/sections';
import { orderFilterKeys, ordersApi, ordersPath, statuses, type Listing, type OrderFilters, type ProductListing } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { OrderFiltersForm, WebsiteOrdersTable } from './website-orders-table';
import { WebsiteOrderCreate } from './website-order-create';

export function canCreateWebsiteOrder(auth: Session, region: Region) {
  return region === 'BD' && canWrite(auth.staff) && ['order.view', 'order.create', 'product.view'].every(key => has(auth.staff, key));
}

export async function WebsiteOrdersPage({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  if (!has(auth.staff, 'order.view')) throw new ApiError(403);
  const filters: OrderFilters = Object.fromEntries(orderFilterKeys.map(key => [key, param(q, key)?.trim().slice(0, 100)]));
  if (filters.filter && !statuses.some(status => status === filters.filter)) delete filters.filter;
  if (filters.location && !mongoId(filters.location)) delete filters.location;
  if (filters.creator && !mongoId(filters.creator) && !['USER', 'GUEST'].includes(filters.creator)) delete filters.creator;
  const page = param(q, 'page');
  const canUpdate = canWrite(auth.staff) && has(auth.staff, 'order.update');
  const results = await Promise.allSettled([
    api(url('/order/workspace/orders', { region, ...filters, page }), auth.token) as Promise<Listing>,
    api(url('/order/workspace/creators', { region }), auth.token) as Promise<{ _id: string; label: string }[]>,
    has(auth.staff, 'business_locations.view') ? loadLocations(auth, region) : Promise.resolve([]),
  ] as const);
  if (results[0].status === 'rejected') {
    if (results[0].reason instanceof ApiError && results[0].reason.status === 400) return <>
      <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title="All Orders" description="Review the date range and try again."/>
      <OrderFiltersForm key={JSON.stringify(filters)} filters={filters} region={region} creators={results[1].status === 'fulfilled' ? results[1].value : []}
        locations={results[2].status === 'fulfilled' ? results[2].value : []}/>
    </>;
    throw results[0].reason;
  }
  const listing = results[0].value;
  return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title={`All Orders (${listing.total.toLocaleString('en')})`}
      description="Review website orders, customer follow-ups and courier activity.">
      {canCreateWebsiteOrder(auth, region) && <Link className="button primary" href="/desk/orders/create"><Plus size={16}/> Create Order</Link>}
    </PageHeading>
    <section className="panel website-order-filters">
      <div className="panel-header"><h2><Filter size={17}/> Filter</h2>
        <a className="button secondary" href={ordersApi('export', region, filters)} download><Download size={16}/> Download Excel</a>
      </div>
      <OrderFiltersForm key={JSON.stringify(filters)} filters={filters} region={region}
        creators={results[1].status === 'fulfilled' ? results[1].value : []}
        locations={results[2].status === 'fulfilled' ? results[2].value : []}/>
    </section>
    <WebsiteOrdersTable key={JSON.stringify({ filters, region, page })} listing={listing} filters={filters} region={region}
      canUpdate={canUpdate} canFraud={canWrite(auth.staff) && region === 'BD'} canReturn={canOperate(auth.staff, 'order-return')}/>
  </>;
}

export async function WebsiteOrderCreatePage({ auth, region }: { auth: Session; region: Region }) {
  if (!canCreateWebsiteOrder(auth, region)) throw new ApiError(403);
  const initial = await api('/order/workspace/products?region=BD', auth.token) as ProductListing;
  return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title="Create Order" description="Add products and record the delivery and payment details for a Bangladesh order.">
      <Link className="button secondary" href={ordersPath}>Back to All Orders</Link>
    </PageHeading>
    <WebsiteOrderCreate initial={initial}/>
  </>;
}
