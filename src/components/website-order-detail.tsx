'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, FileText, MoreHorizontal, Plus, Printer, Truck, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { Region } from '@/lib/sections';
import { addressLabel, currencyFor, money, orderActions, orderDate, orderNumber, ordersPath, statusLabel,
  type OrderAccess, type OrderDetail, type OrderLocation } from '@/lib/website-orders';
import { Badge } from './tables';
import { OrderDialog, OrderNotes, type OrderDialogKind } from './website-orders-dialog';

function Invoice({ order, region }: { order: OrderDetail; region: Region }) {
  const currency = currencyFor(order.currency, region);
  const totals: [string, number | undefined][] = [
    ['Subtotal', order.sub_total], ['Discount', order.total_discount ? -Math.abs(order.total_discount) : order.total_discount],
    ['Delivery charge', order.delivery_charge],
    ['Order total', order.total_amount], ['Paid to date', order.paid_amount], ['Cash on delivery', order.COD],
  ];
  if (order.tax) totals.splice(3, 0, ['Tax', order.tax]);
  return <section className="panel website-invoice" aria-label="Invoice">
    <header className="website-invoice-heading">
      <div className="website-invoice-brand"><span><FileText size={22} aria-hidden="true"/></span><div><h2>Invoice</h2><p>GriipBuddy</p></div></div>
      <div><strong>{order.invoice_number || orderNumber(order)}</strong><p>{orderDate(order.order_date || order.createdAt, region)}</p></div>
    </header>
    <div className="website-invoice-meta">
      <div><h3>Bill to</h3><p><strong>{order.customer_name || '—'}</strong></p>{order.customer_phone && <p>{order.customer_phone}</p>}
        <p>{addressLabel(order.delivery_address) || 'No delivery address recorded.'}</p></div>
      <div><h3>Payment method</h3><p>{order.payment_type ? statusLabel(order.payment_type) : '—'}</p><p>{currency}</p></div>
    </div>
    <div className="website-invoice-items">
      <table><thead><tr><th scope="col">Product</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead>
        <tbody>{order.products.length ? order.products.map((line, index) => <tr key={index}>
          <th scope="row">{line.name || line.sku || 'Item'}{line.sku && line.sku !== line.name && <small>SKU: {line.sku}</small>}</th>
          <td>{line.quantity ?? '—'}</td><td>{money(line.unitPrice, currency)}</td><td>{money(line.amount, currency)}</td>
        </tr>) : <tr><td colSpan={4}>No products recorded.</td></tr>}</tbody>
      </table>
    </div>
    <dl className="website-invoice-totals">{totals.map(([label, value]) => <div key={label} className={label === 'Cash on delivery' ? 'website-invoice-cod' : undefined}>
      <dt>{label}</dt><dd>{money(value, currency)}</dd>
    </div>)}</dl>
  </section>;
}

export function WebsiteOrderDetail({ order, access, locations, region, back, openEdit, canEditDraft, integrations }: {
  order: OrderDetail; access: OrderAccess; locations: OrderLocation[]; region: Region; back: string; openEdit?: boolean; canEditDraft?: boolean;
  integrations: { shipments?: string; payments?: string; receipt?: string };
}) {
  const router = useRouter();
  const actions = orderActions(order, access, region);
  const [dialog, setDialog] = useState<OrderDialogKind | undefined>(openEdit && actions.some(action => action.kind === 'edit') ? 'edit' : undefined);
  const [notice, setNotice] = useState('');
  const currency = currencyFor(order.currency, region);
  const activity = [...order.statusHistory.map(entry => ({ ...entry, text: '', status: entry.status })),
    ...order.activity.map(entry => ({ ...entry, status: undefined }))]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const warehouse = order.assigned_business_location?.name || order.assigned_business_location?.business_location_name;
  return <div className="website-order-detail">
    <div className="website-detail-heading">
      <Link className="website-detail-back" href={back}><ArrowLeft size={15}/> Back to Orders</Link>
      <div className="website-detail-title"><div><div className="eyebrow">Website orders · {region === 'BD' ? 'Bangladesh' : 'International'}</div>
        <h1>Order {orderNumber(order)}</h1></div><Badge value={order.status || 'Unknown'}/></div>
      <div className="page-actions website-detail-tools">
        <button type="button" className="button secondary" onClick={() => window.print()}><Printer size={16}/> Print Invoice</button>
        {canEditDraft && <Link className="button secondary" href={ordersPath + '/' + order._id + '?draft=1'}>Edit items and payment</Link>}
        {!!actions.length && <button type="button" className="button primary" aria-haspopup="dialog" onClick={() => setDialog('actions')}>
          <MoreHorizontal size={17}/> Order Actions
        </button>}
      </div>
    </div>
    {notice && <p role="status" className="notice website-detail-notice">{notice}</p>}
    <div className="website-detail-grid">
      <Invoice order={order} region={region}/>
      <aside className="website-detail-side" aria-label="Order operations">
        <section className="panel website-detail-card">
          <header><h2><UserRound size={17}/> Customer</h2><button type="button" className="website-link" onClick={() => setDialog('history')}>Order history</button></header>
          <strong>{order.customer_name || '—'}</strong>
          {order.customer_phone && <p>{order.customer_phone}</p>}
          <p className="muted">{addressLabel(order.delivery_address) || 'No delivery address recorded.'}</p>
          {order.order_note && <div className="website-detail-customer-note"><small>Customer note</small><p>{order.order_note}</p></div>}
          <div className="website-detail-links">
            {order.is_called ? <small className="muted">Called{order.latestCall?.called_by_name ? ` by ${order.latestCall.called_by_name}` : ''} · {orderDate(order.latestCall?.called_at, region)}</small>
              : access.update && <button type="button" className="website-link" onClick={() => setDialog('called')}>Record call</button>}
            {access.fraud && order.customer_phone && <button type="button" className="website-link" onClick={() => setDialog('fraud')}>Fraud Check</button>}
          </div>
        </section>
        <section className="panel website-detail-card">
          <header><h2><FileText size={17}/> Executive Notes</h2>
            {access.update && <button type="button" className="button secondary" onClick={() => setDialog('note')}><Plus size={14}/> Add note</button>}</header>
          <OrderNotes notes={order.notes} region={region}/>
        </section>
        <section className="panel website-detail-card">
          <header><h2><Truck size={17}/> Fulfillment</h2><button type="button" className="website-link" onClick={() => setDialog('payment')}>Pay Info</button></header>
          <p>{warehouse || 'No warehouse assigned'}</p>
          {order.consignment_id ? <p className="muted">Parcel #{order.consignment_id}</p> : null}
          {order.tracking_code && <p className="muted">Tracking code: {order.tracking_code}</p>}
          {order.managed && <p className="muted">Fulfillment is managed in Shipments.</p>}
          {(integrations.shipments || integrations.payments || integrations.receipt) && <div className="website-detail-links">
            {integrations.shipments && <Link className="website-link" href={integrations.shipments}>Manage shipments</Link>}
            {integrations.payments && <Link className="website-link" href={integrations.payments}>Manage payments</Link>}
            {integrations.receipt && <Link className="website-link" href={integrations.receipt}>Review checkout receipt</Link>}
          </div>}
          <div className="website-detail-links">
            {order.tracking_code && <button type="button" className="website-link" onClick={() => setDialog('track')}>Track order</button>}
            {(order.tracking_code || order.transfer_to_courier || order.managed) &&
              <button type="button" className="website-link" onClick={() => setDialog('tracking')}>Tracking logs</button>}
          </div>
        </section>
      </aside>
      <section className="panel website-detail-card website-detail-activity">
        <header><h2><ClipboardList size={17}/> Order Logs</h2><small className="muted">Newest first</small></header>
        {activity.length ? <ul className="website-log">{activity.map((item, index) => <li key={index}>
          {item.status ? <Badge value={item.status}/> : <strong>{item.text || 'Order updated'}</strong>}
          <small>{orderDate(item.at, region)}{item.by ? ` · ${item.by}` : ''}</small>
        </li>)}</ul> : <p className="muted">No order activity recorded.</p>}
        <h3>Discount Logs</h3>
        {order.discounts.length ? <ul className="website-log">{order.discounts.map((item, index) => <li key={index}>
          <strong>{item.type ? statusLabel(item.type) : 'Discount'} · {money(item.amount, currency)}</strong>
          <small>{orderDate(item.at, region)}</small>
        </li>)}</ul> : <p className="muted">No discounts recorded.</p>}
      </section>
    </div>
    {dialog && <OrderDialog key={dialog} state={{ kind: dialog, order, actions }} region={region} locations={locations}
      close={() => setDialog(undefined)} change={setDialog}
      saved={message => { setDialog(undefined); setNotice(message); router.refresh(); }}/>}
  </div>;
}
