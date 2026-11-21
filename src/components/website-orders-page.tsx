import Link from 'next/link';
import { ChevronLeft, Download, Filter, Plus } from 'lucide-react';
import { api, ApiError, canWrite, integratedCheckoutEnabled, mongoId, obj, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { connectedCatalogConfigured } from '@/lib/connected-catalog';
import { nativeOrderId, nativeOrderPrefix } from '@/lib/connected-order-contract';
import { canOperate } from '@/lib/operations';
import { canManage } from '@/lib/managed';
import { canReadHybridReports, getHybridOrder, hybridOrderId, hybridReportLocations, loadWebsiteOrders } from '@/lib/hybrid-orders';
import { has, superAdmin, type Region } from '@/lib/sections';
import { mayExportOrders, orderActions, orderFilterKeys, orderListQuery, ordersApi, ordersPath, statuses, type Listing, type OrderAccess, type OrderDetail, type OrderFilters,
  type OrderLocation, type ProductListing, type WebsiteOrderDraft } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { OrderFiltersForm, WebsiteOrdersTable } from './website-orders-table';
import { WebsiteOrderCreate } from './website-order-create';
import { WebsiteOrderDetail } from './website-order-detail';
import { ProductionWebsiteOrders } from './production-website-orders';
import { ProductionWebsiteOrderDetail } from './production-website-order-detail';
import { MarketplaceOrder } from './connected-marketplace-orders';
import editor from './production-website-order-editor.module.css';

const productionPageSizes = ['20', '40', '60', '80', '100', 'all'];

export function canCreateWebsiteOrder(auth: Session, region: Region) {
  return region === 'BD' && canWrite(auth.staff) && ['order.view', 'order.create', 'product.view'].every(key => has(auth.staff, key));
}

function selectedFilters(q: Query) {
  const filters: OrderFilters = Object.fromEntries(orderFilterKeys.map(key => [key, param(q, key)?.trim().slice(0, 100)]));
  filters.filter ||= param(q, 'status')?.trim().slice(0, 100);
  if (filters.filter && !filters.filter.split(',').every(value => statuses.some(status => status === value))) delete filters.filter;
  if (filters.location && !mongoId(filters.location)) delete filters.location;
  if (filters.sort && !['newest', 'oldest'].includes(filters.sort)) delete filters.sort;
  if (filters.creator && !mongoId(filters.creator) && !['USER', 'GUEST'].includes(filters.creator)) delete filters.creator;
  return filters;
}

export function accessFor(auth: Session, region: Region): OrderAccess {
  const write = canWrite(auth.staff);
  const update = write && has(auth.staff, 'order.update');
  return { update, fraud: region === 'BD' && has(auth.staff, 'order.view'), delete: write && has(auth.staff, 'order.delete'),
    product: has(auth.staff, 'product.view'), return: canOperate(auth.staff, 'order-return'), pick: canOperate(auth.staff, 'order-pick'),
    handover: update && has(auth.staff, 'courier.update'), dispatch: update && has(auth.staff, 'business_locations.view') };
}

const loadOrderLocations = (auth: Session, region: Region) =>
  api(url('/order/workspace/locations', { region }), auth.token) as Promise<OrderLocation[]>;

export async function WebsiteOrdersPage({ auth, q, region, executive = false, productionLayout = false }: {
  auth: Session; q: Query; region: Region; executive?: boolean; productionLayout?: boolean;
}) {
  if (!has(auth.staff, 'order.view')) throw new ApiError(403);
  const filters = selectedFilters(q);
  if (productionLayout && canReadHybridReports(auth, region)) filters.location = hybridReportLocations(auth, filters.location);
  const listPath = executive ? '/desk/orders/sales-executive' : ordersPath;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  if (executive && !Object.hasOwn(q, 'from') && !Object.hasOwn(q, 'to')) {
    filters.from = today; filters.to = today;
  }
  const title = executive ? 'Sales Executive' : 'All Orders';
  const page = param(q, 'page');
  const requestedLimit = param(q, 'limit');
  const limit = productionLayout && requestedLimit && productionPageSizes.includes(requestedLimit) ? requestedLimit : undefined;
  const dateDefaults = productionLayout && !filters.from && !filters.to ? { from: '1970-01-01', to: today } : {};
  const results = await Promise.allSettled([
    productionLayout ? loadWebsiteOrders(auth, region, { ...filters, ...dateDefaults }, page, limit) :
      api(url('/order/workspace/orders', { region, ...filters, ...dateDefaults, page, limit }), auth.token) as Promise<Listing>,
    api(url('/order/workspace/creators', { region }), auth.token) as Promise<{ _id: string; label: string }[]>,
    has(auth.staff, 'business_locations.view') ? loadOrderLocations(auth, region) : Promise.resolve([]),
  ] as const);
  const creators = results[1].status === 'fulfilled' ? results[1].value : [];
  const locations = results[2].status === 'fulfilled' ? results[2].value : [];
  if (results[0].status === 'rejected') {
    if (!(results[0].reason instanceof ApiError) ||
        (results[0].reason.status !== 400 && !(productionLayout && limit === 'all' && results[0].reason.status === 422))) throw results[0].reason;
    if (productionLayout) return <ProductionWebsiteOrders key={region} filters={filters} region={region}
      creators={creators} locations={locations} access={accessFor(auth, region)} pageSizes={productionPageSizes}
      selectedSize={limit} canExport={mayExportOrders(auth.staff)} executive={executive} issue={results[0].reason.status === 422 ? 'too-many' : 'dates'}/>;
    return <>
      <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title={title} description="Review the date range and try again."/>
      <OrderFiltersForm key={JSON.stringify(filters)} filters={filters} region={region} listPath={listPath}
        creators={creators} locations={locations}/>
    </>;
  }
  const listing = results[0].value;
  if (!listing) throw new ApiError(503);
  if (productionLayout) return <ProductionWebsiteOrders key={region} listing={listing} filters={filters} region={region}
    creators={creators} locations={locations} access={accessFor(auth, region)} pageSizes={productionPageSizes} selectedSize={limit} executive={executive}
    canExport={mayExportOrders(auth.staff)}
    batchActor={region === 'BD' && canManage(auth.staff) && has(auth.staff, 'order.update') ? auth.staff.id : undefined}/>;
  return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title={title + ' (' + listing.total.toLocaleString('en') + ')'}
      description="Review website orders, customer follow-ups and courier activity.">
      {canCreateWebsiteOrder(auth, region) && <Link className="button primary" href="/desk/orders/create"><Plus size={16}/> Create Order</Link>}
    </PageHeading>
    <section className="panel website-order-filters">
      <div className="panel-header"><h2><Filter size={17}/> Filter</h2>
        {mayExportOrders(auth.staff) && <a className="button secondary" href={ordersApi('export', region, filters)} download><Download size={16}/> Download Excel</a>}
      </div>
      <OrderFiltersForm key={JSON.stringify(filters)} filters={filters} region={region} listPath={listPath}
        creators={creators}
        locations={locations}/>
    </section>
    <WebsiteOrdersTable key={JSON.stringify({ filters, region, page })} listing={listing} filters={filters} region={region} listPath={listPath} executive={executive}
      access={accessFor(auth, region)} locations={locations}/>
  </>;
}

export async function WebsiteOrderDetailPage({ auth, q, region, id, productionLayout = false }: {
  auth: Session; q: Query; region: Region; id: string; productionLayout?: boolean;
}) {
  if (!has(auth.staff, 'order.view')) throw new ApiError(403);
  if (id.startsWith(nativeOrderPrefix)) {
    const native = nativeOrderId(id);
    if (!native || !connectedCatalogConfigured()) throw new ApiError(404);
    return MarketplaceOrder({ auth, region, id: native });
  }
  const hybrid = hybridOrderId(id);
  const source = param(q, 'source');
  const productionOrdersPath = source === 'assigned' ? '/dashboard/assigned-orders'
    : source === 'executive' ? '/dashboard/sales-executive' : '/dashboard/orders';
  if (productionLayout && hybrid && param(q, 'draft') !== '1' && param(q, 'edit') !== '1') {
    const { order, fulfillment } = await getHybridOrder(hybrid, auth, region);
    const size = param(q, 'limit');
    const back = productionOrdersPath + orderListQuery(region, selectedFilters(q), param(q, 'page'))
      + (size && productionPageSizes.includes(size) ? '&limit=' + size : '');
    return <ProductionWebsiteOrderDetail order={order} region={region} back={back}
      access={{ update: false, fraud: false, delete: false, product: false, return: false, pick: false, handover: false, dispatch: false }}
      locations={[]} hybridFulfillment={fulfillment} integrations={{}}/>;
  }
  if (!mongoId(id)) throw new ApiError(404);
  const access = accessFor(auth, region);
  const [order, locations, checkout] = await Promise.all([
    api(url('/order/workspace/orders/' + id, { region }), auth.token) as Promise<OrderDetail>,
    access.dispatch && region === 'BD' ? loadOrderLocations(auth, region).catch(() => []) : [],
    integratedCheckoutEnabled() && superAdmin(auth.staff)
      ? api('/commerce/admin/orders/' + id, auth.token).then(obj).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return undefined;
        throw error;
      }) : undefined,
  ]);
  const mayDraft = region === 'BD' && access.update && access.product && !order.managed && !order.transfer_to_courier
    && !order.consignment_id && orderActions(order, access, region).some(action => action.kind === 'edit');
  const regionQuery = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';
  const direct = productionLayout ? '/dashboard/order-details/' + id + regionQuery : ordersPath + '/' + id;
  const size = productionLayout ? param(q, 'limit') : undefined;
  const back = (productionLayout ? productionOrdersPath : ordersPath)
    + orderListQuery(region, selectedFilters(q), param(q, 'page'))
    + (size && productionPageSizes.includes(size) ? '&limit=' + size : '');
  const draft = mayDraft ? await api('/order/workspace/orders/' + id + '/draft?region=BD', auth.token).catch((error: unknown) => {
    if (error instanceof ApiError && [403,404,409].includes(error.status)) return null;
    throw error;
  }) as WebsiteOrderDraft | null : null;
  if (param(q, 'draft') === '1' && productionLayout) return <>
    <div className={editor.heading}><Link href={direct} aria-label="Back to order"><ChevronLeft size={16}/></Link><h1>Edit Order</h1></div>
    {draft ? <WebsiteOrderCreate key={draft.revision} draft={draft} productionLayout
      initial={await api('/order/workspace/draft-products?region=BD', auth.token) as ProductListing}/>
      : <div className={editor.panel}>
        <p role="status">Items and payment cannot be edited for this order.</p>
        {orderActions(order, access, region).some(action => action.kind === 'edit') &&
          <Link className={editor.outline} href={direct + (regionQuery ? '&' : '?') + 'edit=1'}>Edit contact and delivery details</Link>}
      </div>}
  </>;
  if (param(q, 'draft') === '1') return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title="Edit items and payment"
      description={draft ? 'Review the order total and reservations before saving.' : 'Items and payment cannot be edited for this order.'}>
      <Link className="button secondary" href={direct}>Back to order</Link>
      {!draft && orderActions(order, access, region).some(action => action.kind === 'edit') &&
        <Link className="button primary" href={direct + '?edit=1'}>Edit contact and delivery details</Link>}
    </PageHeading>
    {draft && <WebsiteOrderCreate key={draft.revision} draft={draft}
      initial={await api('/order/workspace/draft-products?region=BD', auth.token) as ProductListing}/>}
  </>;
  const manageOrder = canManage(auth.staff) && (!checkout || checkout.kind === 'cart');
  const integrations = {
    shipments: manageOrder ? url('/desk/shipping/shipment-desk', {region, order:id}) : undefined,
    payments: manageOrder ? url('/desk/payments/payment-desk', {region, order:id}) : undefined,
    receipt: checkout?.hasReceipt === true ? url('/desk/payments/checkout', {region, receipt:id}) : undefined,
  };
  if (productionLayout) return <ProductionWebsiteOrderDetail key={order._id} order={order} access={access} locations={locations}
    region={region} integrations={order.managed ? integrations : {}} openEdit={param(q, 'edit') === '1'}
    managedOperations={order.managed === true && manageOrder}
    editHref={draft ? '/dashboard/orders/edit/' + id : undefined} back={back}/>;
  return <WebsiteOrderDetail order={order} access={access} locations={locations} region={region} canEditDraft={!!draft}
    integrations={integrations} openEdit={param(q, 'edit') === '1'} back={back}/>;
}

export async function WebsiteOrderCreatePage({ auth, region, productionLayout = false }: { auth: Session; region: Region; productionLayout?: boolean }) {
  if (!canCreateWebsiteOrder(auth, region)) throw new ApiError(403);
  const initial = await api('/order/workspace/products?region=BD', auth.token) as ProductListing;
  if (productionLayout) return <>
    <div className={editor.heading}><Link href="/dashboard/orders" aria-label="Back to Orders"><ChevronLeft size={16}/></Link><h1>Create Order</h1></div>
    <WebsiteOrderCreate initial={initial} productionLayout/>
  </>;
  return <>
    <PageHeading eyebrow="COMMERCE / WEBSITE ORDERS" title="Create Order" description="Add products and record the delivery and payment details for a Bangladesh order.">
      <Link className="button secondary" href={ordersPath}>Back to All Orders</Link>
    </PageHeading>
    <WebsiteOrderCreate initial={initial}/>
  </>;
}
