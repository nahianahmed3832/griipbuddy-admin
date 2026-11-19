import Link from 'next/link';
import { ApiError, url, type Session } from '@/lib/api';
import { connectedCatalog, mayEditConnectedOrder, mayReadConnectedOrders } from '@/lib/connected-catalog';
import { marketplaceCasesPath, marketplaceOrderQueues, marketplaceOrdersPath, nativeOrderPrefix,
  type ConnectedOrderDetail, type OrderList, type PurchasedLine } from '@/lib/connected-order-contract';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { money, orderDate, statusLabel } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { MarketplaceOrderAction, PrintMarketplacePackingSlip } from './connected-marketplace-order-form';
import styles from './connected-marketplace-orders.module.css';

export const connectedOrderHref = (id: string, region: Region) => url(`/dashboard/order-details/${nativeOrderPrefix}${id}`, { region });

export function connectedOrdersPage(query: Query) {
  const input = param(query, 'page');
  return input && /^[1-9]\d{0,3}$/.test(input) ? Math.min(Number(input), 10_000) : 1;
}

export function MarketplacePagination({ path, page, hasNext, params }: {
  path: string; page: number; hasNext: boolean; params: Record<string, string | undefined>;
}) {
  if (page === 1 && !hasNext) return null;
  return <nav className="pagination" aria-label="Order pages"><span>Page {page}</span><div>
    {page > 1 && <Link className="button secondary" href={url(path, { ...params, page: String(page - 1) })}>Previous</Link>}
    {hasNext && page < 10_000 && <Link className="button secondary" href={url(path, { ...params, page: String(page + 1) })}>Next</Link>}
  </div></nav>;
}

export async function MarketplaceOrders({ auth, region, query }: { auth: Session; region: Region; query: Query }) {
  const page = connectedOrdersPage(query);
  const queue = marketplaceOrderQueues.find(([key]) => key === param(query, 'queue'))?.[0] ?? 'queue';
  const { rows, hasNext } = await connectedCatalog<OrderList>(auth, region, { read: 'orders', page, queue });
  return <div className={styles.workspace}>
    <PageHeading eyebrow="WEBSITE ORDERS" title="Marketplace orders" description="Review native checkout orders and their warehouse allocations in the selected market.">
      <Link className="button secondary" href={url('/dashboard/orders', { region })}>Recovered and Hybrid orders</Link>
      {mayReadConnectedOrders(auth, true) && <Link className="button secondary" href={url(marketplaceCasesPath, { region })}>Order cases</Link>}
    </PageHeading>
    <section className="panel">
      <form action={adminPath(marketplaceOrdersPath)} className="filters">
        <input type="hidden" name="region" value={region}/>
        <label className="filter-label">Order queue<select name="queue" defaultValue={queue}>
          {marketplaceOrderQueues.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <button type="submit" className="button primary">Apply filter</button>
      </form>
      {rows.length ? <div className="table-scroll"><table aria-label="Marketplace orders">
        <thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>District</th><th>Lines</th><th>Total</th><th>Placed</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><Link className="table-link" href={connectedOrderHref(row.id, region)}>{row.reference}</Link></td>
          <td>{row.fulfillment}{row.pendingCancellation && <div className="muted">Cancellation pending · Shipment on hold</div>}</td>
          <td>{row.payment ? statusLabel(row.payment.status) : 'Unrecorded'}{row.requiresCodReview && <div className="muted">Manual COD review required</div>}</td>
          <td>{row.districtLabel}</td><td>{row._count.items}</td>
          <td>{money(row.totalMinor / 100, row.currency)}</td><td>{orderDate(row.createdAt, region)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty"><p>No orders match this queue in the selected market.</p></div>}
      <MarketplacePagination path={marketplaceOrdersPath} page={page} hasNext={hasNext} params={{ region, queue }}/>
    </section>
  </div>;
}

export function MarketplacePurchasedLines({ lines, currency }: { lines: readonly PurchasedLine[]; currency: string }) {
  if (!lines.length) return <p className="muted">There are no purchased lines for this record.</p>;
  return <div className={`${styles.lines} table-scroll`}><table aria-label="Purchased variants">
    <thead><tr><th>Purchased item</th><th>SKU</th><th>Quantity</th><th>Unit price</th></tr></thead>
    <tbody>{lines.map(line => <tr key={line.id}>
      <td><strong>{line.productName}</strong><div>{line.options}</div>{line.personalization && <div>Personalization: {line.personalization}</div>}</td>
      <td><strong>{line.sku}</strong><div className="muted">{line.variantId}</div></td><td>{line.quantity}</td><td>{money(line.unitPriceMinor / 100, currency)}</td>
    </tr>)}</tbody>
  </table></div>;
}

const stepLabels: Record<string, string> = { PACKING: 'Start packing', READY_TO_SHIP: 'Mark ready to ship', SHIPPED: 'Record dispatch', DELIVERED: 'Mark delivered' };

function TrackingFields() {
  return <><label>Carrier<input name="carrier" maxLength={60} required/></label>
    <label>Tracking reference<input name="trackingReference" maxLength={80} required/></label></>;
}

export function OrderConfirmation({ children }: { children: string }) {
  return <label className={styles.check}><input type="checkbox" name="confirmed" value="yes" required/>{children}</label>;
}

function TrackingAction({ orderId, parcelId, tracking, region, mayFlagRefusal }: {
  orderId: string; parcelId?: string; tracking: NonNullable<ConnectedOrderDetail['shipment']>; region: Region; mayFlagRefusal: boolean;
}) {
  const next = tracking.next.filter(status => mayFlagRefusal || status !== 'REFUSED');
  if (!next.length) return null;
  return <MarketplaceOrderAction action={parcelId ? 'order.parcel.tracking' : 'order.tracking'} region={region} input={{ orderId, parcelId }} label="Record tracking update">
    <label>Delivery status<select name="status" defaultValue="" required><option value="" disabled>Choose a status</option>
      {next.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
    {tracking.evidenceRequired && <label>Courier evidence reference<input name="evidence" minLength={3} maxLength={200} required/></label>}
  </MarketplaceOrderAction>;
}

function PackingSlip({ order }: { order: ConnectedOrderDetail }) {
  const groups = order.parcels.length ? order.parcels.map(parcel => ({ id: parcel.id, label: parcel.warehouse, lines: parcel.lines })) :
    [{ id: order.id, label: 'Pack these items', lines: order.lines }];
  return <article className={styles.sheet} aria-label="Packing slip">
    <h1>GriipBuddy packing slip</h1><p>{order.reference} · {order.marketName}</p>
    {order.pendingCancellation && <p><strong>Shipment on hold while cancellation is reviewed.</strong></p>}
    <h2>Ship to</h2><address>{order.shipping.name}<br/>{order.shipping.address}<br/>{order.shipping.locality}, {order.shipping.district} {order.shipping.postalCode}<br/>{order.shipping.phone}</address>
    {groups.map(group => <section key={group.id}><h2>{group.label}</h2><ul>{group.lines.map(line => <li key={line.id}>
      {line.quantity} × {line.productName} · {line.options} · {line.sku}{line.personalization && ` · ${line.personalization}`}
    </li>)}</ul></section>)}
    {order.payment.method === 'COD' && <p>Order COD due {money(order.payment.dueMinor / 100, order.currency)} {order.currency}</p>}
  </article>;
}

export async function MarketplaceOrder({ auth, region, id }: { auth: Session; region: Region; id: string }) {
  if (!mayReadConnectedOrders(auth)) throw new ApiError(403);
  const order = await connectedCatalog<ConnectedOrderDetail>(auth, region, { read: 'order', id });
  const canAdvance = mayEditConnectedOrder(auth, 'order.advance');
  const canTrack = mayEditConnectedOrder(auth, 'order.tracking');
  const canReceive = mayEditConnectedOrder(auth, 'order.parcel.receive');
  const mayReviewCases = mayReadConnectedOrders(auth, true);
  const price = (minor: number) => money(minor / 100, order.currency);
  const date = (value: string) => new Intl.DateTimeFormat(order.locale,
    { dateStyle: 'medium', timeStyle: 'short', timeZone: order.timeZone }).format(new Date(value));
  const totals = [['Merchandise', order.subtotalMinor], ['Discount', -order.discountMinor], ['Delivery', order.deliveryMinor],
    ['Tax', order.taxMinor], ['Total paid or due', order.totalMinor]] as const;

  return <>
    <div className={`${styles.screen} ${styles.workspace}`}>
      <Link className="table-link" href={url(marketplaceOrdersPath, { region })}>← Marketplace orders</Link>
      <PageHeading eyebrow="WEBSITE ORDERS / MARKETPLACE" title={order.reference}
        description={`${order.marketName} · ${date(order.createdAt)} · ${statusLabel(order.status)}`}>
        {order.packable && <PrintMarketplacePackingSlip/>}
      </PageHeading>
      {order.pendingCancellation && <p className="notice warn" role="status">Shipment is on hold while a cancellation request is reviewed.</p>}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={`panel padded ${styles.panel}`}><h2>Purchased items</h2><MarketplacePurchasedLines lines={order.lines} currency={order.currency}/></section>
          <section className={`panel padded ${styles.panel}`}><h2>Delivery details</h2>
            <address>{order.shipping.name}<br/>{order.shipping.address}<br/>{order.shipping.locality}, {order.shipping.district} {order.shipping.postalCode}<br/>{order.shipping.phone}</address>
            <p>{order.shipping.service}</p>
          </section>
          {order.parcels.map((parcel, index) => <section key={parcel.id} className={`panel padded ${styles.panel} ${styles.stack}`} aria-label={`Parcel ${index + 1}`}>
            <div><h2>Parcel {index + 1} · {parcel.warehouse}</h2><p>{parcel.status}</p>{parcel.reference && <p>{parcel.carrier} · {parcel.reference}</p>}</div>
            <MarketplacePurchasedLines lines={parcel.lines} currency={order.currency}/>
            {parcel.disposition && <p>{parcel.disposition === 'RESTOCK' ? 'Items restored to the original warehouse allocation.' : 'Items held for inspection.'}</p>}
            {parcel.events.length > 0 && <ol className={styles.list}>{parcel.events.map(event => <li key={event.status}>
              {event.status} · {date(event.recordedAt)}{event.evidence && ` · ${event.evidence}`}
            </li>)}</ol>}
            {canAdvance && parcel.dispatchable && <MarketplaceOrderAction action="order.parcel.dispatch" region={region} input={{ orderId: id, parcelId: parcel.id }} label="Dispatch parcel"><TrackingFields/></MarketplaceOrderAction>}
            {canTrack && <TrackingAction orderId={id} parcelId={parcel.id} tracking={parcel} region={region} mayFlagRefusal={mayReviewCases}/>}
            {canReceive && parcel.receivable && <MarketplaceOrderAction action="order.parcel.receive" region={region} input={{ orderId: id, parcelId: parcel.id }} label="Record parcel receipt">
              <label>Stock disposition<select name="disposition" defaultValue="" required><option value="" disabled>Choose after inspection</option>
                <option value="RESTOCK">Restock complete, sellable items</option><option value="HOLD">Hold for review</option></select></label>
              <label>Warehouse note<textarea name="note" minLength={3} maxLength={200} required/></label>
              <OrderConfirmation>I received and inspected this parcel.</OrderConfirmation>
            </MarketplaceOrderAction>}
          </section>)}
          {order.shipment && <section className={`panel padded ${styles.panel}`}><h2>Courier shipment</h2>
            <p>{statusLabel(order.shipment.status)} · {order.shipment.carrier} · {order.shipment.reference}</p>
            {canTrack && <TrackingAction orderId={id} tracking={order.shipment} region={region} mayFlagRefusal={mayReviewCases}/>}
          </section>}
          {order.sellers.length > 0 && <section className={`panel padded ${styles.panel}`}><h2>Seller handoff</h2>
            <ul className={styles.list}>{order.sellers.map(seller => <li key={seller.id}>
              <strong>{seller.name}</strong>{` · ${seller.preparation}`}{seller.updatedAt && ` · ${date(seller.updatedAt)}`}
            </li>)}</ul>
          </section>}
          <section className={`panel padded ${styles.panel}`}><h2>Fulfillment history</h2>
            {order.events.length ? <ol className={styles.list}>{order.events.map(event => <li key={event.id}>
              <strong>{event.kind === 'STATUS_CHANGED' ? statusLabel(event.status) : statusLabel(event.kind)}</strong>{` · ${date(event.date)} · ${event.actor ?? 'Shopper checkout'}`}
            </li>)}</ol> : <p className="muted">No fulfillment events recorded.</p>}
          </section>
        </div>
        <div className={styles.stack}>
          <section className={`panel padded ${styles.panel} ${styles.stack}`}><h2>Payment and fulfillment</h2>
            <div className={styles.badges}><span>{statusLabel(order.payment.method)}</span><span>{statusLabel(order.payment.status)}</span><span>{order.fulfillment}</span></div>
            <dl className={styles.terms}>{totals.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{price(amount)}</dd></div>)}
              <div><dt>Cash awaiting collection</dt><dd>{price(order.payment.dueMinor)}</dd></div>
            </dl>
            {order.requiresCodReview && <p className="notice warn">Review cash collection manually. A parcel was refused.</p>}
            {canAdvance && order.next && <MarketplaceOrderAction key={order.next} action="order.advance" region={region}
              input={{ orderId: id, next: order.next }} label={stepLabels[order.next] ?? 'Update fulfillment'}>
              {order.next === 'SHIPPED' && <TrackingFields/>}
            </MarketplaceOrderAction>}
            {order.canCollect && mayEditConnectedOrder(auth, 'order.collect') && <MarketplaceOrderAction action="order.collect" region={region}
              input={{ orderId: id }} label="Record cash collection"><OrderConfirmation>I confirm the full cash amount was collected.</OrderConfirmation></MarketplaceOrderAction>}
            {order.canCancel && mayEditConnectedOrder(auth, 'order.cancel') && <MarketplaceOrderAction action="order.cancel" region={region}
              input={{ orderId: id }} label="Cancel order"><OrderConfirmation>Cancel the unshipped order and restore its stock.</OrderConfirmation></MarketplaceOrderAction>}
          </section>
          {mayReviewCases && <section className={`panel padded ${styles.panel}`}><h2>Order cases</h2>
            {order.cases.length ? <ul className={styles.list}>{order.cases.map(entry => <li key={entry.id}>
              <Link className="table-link" href={url(`${marketplaceCasesPath}/${entry.id}`, { region })}>{statusLabel(entry.kind)} · {statusLabel(entry.status)}</Link>
            </li>)}</ul> : <p className="muted">No cases have been opened for this order.</p>}
          </section>}
        </div>
      </div>
    </div>
    {order.packable && <PackingSlip order={order}/>}
  </>;
}
