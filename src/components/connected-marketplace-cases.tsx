import Link from 'next/link';
import { ApiError, url, type Session } from '@/lib/api';
import { connectedCatalog, mayEditConnectedOrder, mayReadConnectedOrders } from '@/lib/connected-catalog';
import { marketplaceCasesPath, marketplaceOrdersPath, orderIdentifier, type CaseList, type ConnectedOrderCaseDetail } from '@/lib/connected-order-contract';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { money, orderDate, statusLabel } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { MarketplaceOrderAction } from './connected-marketplace-order-form';
import { connectedOrderHref, connectedOrdersPage, MarketplacePagination, MarketplacePurchasedLines, OrderConfirmation } from './connected-marketplace-orders';
import styles from './connected-marketplace-orders.module.css';

export async function MarketplaceOrderCases({ auth, region, query }: { auth: Session; region: Region; query: Query }) {
  const page = connectedOrdersPage(query);
  const closed = param(query, 'closed') === '1';
  const { rows, hasNext } = await connectedCatalog<CaseList>(auth, region, { read: 'order-cases', page, closed });
  return <div className={styles.workspace}>
    <PageHeading eyebrow="WEBSITE ORDERS / MARKETPLACE" title="Order cases" description="Review requests and returns for purchases in the selected market.">
      <Link className="button secondary" href={url(marketplaceOrdersPath, { region })}>Marketplace orders</Link>
    </PageHeading>
    <section className="panel">
      <form action={adminPath(marketplaceCasesPath)} className="filters">
        <input type="hidden" name="region" value={region}/>
        <label className={styles.check}><input type="checkbox" name="closed" value="1" defaultChecked={closed}/> Include closed cases</label>
        <button type="submit" className="button primary">Apply filter</button>
      </form>
      {rows.length ? <div className="table-scroll"><table aria-label="Marketplace order cases">
        <thead><tr><th>Order</th><th>Case</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><Link className="table-link" href={connectedOrderHref(row.order.id, region)}>{row.order.reference}</Link></td>
          <td><Link className="table-link" href={url(`${marketplaceCasesPath}/${row.id}`, { region })}>{statusLabel(row.kind)}</Link></td>
          <td>{statusLabel(row.status)}</td><td>{orderDate(row.updatedAt, region)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty"><p>No matching order cases in the selected market.</p></div>}
      <MarketplacePagination path={marketplaceCasesPath} page={page} hasNext={hasNext} params={{ region, closed: closed ? '1' : undefined }}/>
    </section>
  </div>;
}

function ShopperMessage() {
  return <label>Message to shopper<textarea name="note" minLength={3} maxLength={1500} rows={3} required/></label>;
}

function CaseActions({ record, region }: { record: ConnectedOrderCaseDetail; region: Region }) {
  const { allowed, id: caseId, revision } = record;
  const input = { caseId, revision };
  const maxRefund = (record.refundLimitMinor / 100).toFixed(2);
  const visible = allowed.inspection || allowed.replacement || allowed.cancel || allowed.refund || allowed.review.length > 0;
  if (!visible) return <p className="muted">There is no action available in this case state.</p>;
  return <div className={styles.stack} key={revision}>
    {allowed.review.length > 0 && <MarketplaceOrderAction action="order.case" region={region} input={{ ...input, action: 'review' }} label="Save case update">
      <label>Case status<select name="status" defaultValue="" required><option value="" disabled>Choose a status</option>
        {allowed.review.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <ShopperMessage/>
      {record.status === 'REFUND_APPROVED' && <p className="muted">Confirm the approved payment was handled before resolving the case.</p>}
    </MarketplaceOrderAction>}
    {allowed.inspection && <>
      <MarketplaceOrderAction action="order.case" region={region} input={{ ...input, action: 'schedule-pickup' }} label="Save pickup details">
        <label>Pickup date and time ({record.timeZone})<input type="datetime-local" name="pickupAt" required/></label>
        <label>Courier pickup reference<input name="pickupReference" minLength={3} maxLength={80} required/></label><ShopperMessage/>
      </MarketplaceOrderAction>
      <MarketplaceOrderAction action="order.case" region={region} input={{ ...input, action: 'receive' }} label="Record return receipt">
        <label>Stock disposition<select name="disposition" defaultValue="" required><option value="" disabled>Choose after inspection</option>
          <option value="RESTOCK">Restock complete, sellable items</option><option value="HOLD">Hold for review</option></select></label>
        <OrderConfirmation>I received and inspected every listed item and quantity.</OrderConfirmation>
      </MarketplaceOrderAction>
    </>}
    {allowed.replacement && <MarketplaceOrderAction action="order.case" region={region} input={{ ...input, action: 'ship-exchange' }} label="Record replacement shipment">
      <label>Replacement tracking reference<input name="trackingReference" minLength={3} maxLength={80} required/></label><ShopperMessage/>
    </MarketplaceOrderAction>}
    {allowed.cancel && <MarketplaceOrderAction action="order.case" region={region} input={{ ...input, action: 'approve-cancellation' }} label="Approve cancellation">
      <p className="muted">Cancel this unshipped order, release its stock, and void the amount due on delivery.</p><ShopperMessage/>
    </MarketplaceOrderAction>}
    {allowed.refund && <MarketplaceOrderAction action="order.case" region={region}
      input={{ ...input, action: 'approve-refund', ...(allowed.requiresCancellationRefund && { amountMinor: record.refundLimitMinor }) }}
      label={allowed.requiresCancellationRefund ? 'Approve refund and cancel order' : 'Approve refund'}>
      {allowed.requiresCancellationRefund ? <p>Approve the full refund of {money(record.refundLimitMinor / 100, record.order.currency)}.</p>
        : <label>Refund amount ({record.order.currency})<input name="amount" type="number" min="0.01" max={maxRefund} step="0.01" defaultValue={maxRefund} required/></label>}
      <p className="muted">Record approval here and process the approved payment separately before resolving the case.</p><ShopperMessage/>
    </MarketplaceOrderAction>}
  </div>;
}

export async function MarketplaceOrderCase({ auth, region, id }: { auth: Session; region: Region; id: string }) {
  if (!mayReadConnectedOrders(auth, true)) throw new ApiError(403);
  if (!orderIdentifier.test(id)) throw new ApiError(404);
  const record = await connectedCatalog<ConnectedOrderCaseDetail>(auth, region, { read: 'order-case', id });
  const { order, events, returnLines } = record;
  const date = (value: string) => new Intl.DateTimeFormat(record.locale,
    { dateStyle: 'medium', timeStyle: 'short', timeZone: record.timeZone }).format(new Date(value));
  return <div className={styles.workspace}>
    <nav aria-label="Order case breadcrumb" className={styles.linkList}>
      <Link className="table-link" href={url(marketplaceCasesPath, { region })}>← Order cases</Link>
      <Link className="table-link" href={connectedOrderHref(order.id, region)}>View order {order.reference}</Link>
    </nav>
    <PageHeading eyebrow="WEBSITE ORDERS / MARKETPLACE" title={`${statusLabel(record.kind)} case`} description={statusLabel(record.status)}/>
    <div className={styles.columns}>
      <div className={styles.stack}>
        <section className={`panel padded ${styles.panel}`}><h2>Purchased return lines</h2>
          <MarketplacePurchasedLines lines={returnLines} currency={order.currency}/>
          {returnLines.some(line => line.replacementVariantName) && <ul className={styles.list}>{returnLines.filter(line => line.replacementVariantName).map(line =>
            <li key={line.id}>{line.sku} · Requested replacement {line.replacementVariantName}</li>)}</ul>}
        </section>
        <section className={`panel padded ${styles.panel}`}><h2>Case history</h2>
          {events.length ? <ol className={styles.list}>{events.map(event => <li key={event.revision}>
            <strong>{statusLabel(event.status)}</strong>{` · ${date(event.createdAt)}`}{event.note && <div>{event.note}</div>}
          </li>)}</ol> : <p className="muted">No case history recorded.</p>}
        </section>
      </div>
      <section className={`panel padded ${styles.panel} ${styles.stack}`}><h2>Review and fulfillment</h2>
        {record.pickupAt && <p>Pickup {date(record.pickupAt)} · {record.pickupReference}</p>}
        {record.returnDisposition && <p>{record.returnDisposition === 'RESTOCK' ? 'Items were restored to available stock.' : 'Items are on hold for review.'}</p>}
        {record.replacementTrackingReference && <p>Replacement tracking {record.replacementTrackingReference}</p>}
        {record.refundAmountMinor !== null && <p>Approved amount {money(record.refundAmountMinor / 100, order.currency)}</p>}
        {mayEditConnectedOrder(auth, 'order.case') ? <CaseActions record={record} region={region}/>
          : <p className="muted">Your access allows viewing this case.</p>}
      </section>
    </div>
  </div>;
}
