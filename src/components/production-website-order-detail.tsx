'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import {
  currencyFor, money, orderActions, orderDate, orderNumber,
  type OrderAccess, type OrderDetail, type OrderLocation,
} from '@/lib/website-orders';
import { OrderDialog, type OrderDialogKind } from './website-orders-dialog';
import { ProductionManagedPayment, ProductionManagedShipments, useManagedOrder } from './production-order-operations';
import styles from './production-website-order-detail.module.css';

type Props = {
  order: OrderDetail;
  access: OrderAccess;
  locations: OrderLocation[];
  region: Region;
  back: string;
  openEdit?: boolean;
  editHref?: string;
  managedOperations?: boolean;
  integrations: { shipments?: string; payments?: string; receipt?: string };
};

function Invoice({ order, region, openPayment, payment }: {
  order: OrderDetail; region: Region; openPayment: () => void; payment?: ReactNode;
}) {
  const currency = currencyFor(order.currency, region);
  const amount = (value?: number) => currency === 'BDT' ? `${value ?? ''} TK`.trim() : money(value, currency);
  const totals = [
    ['Sub Total:', amount(order.sub_total)],
    ['Discount:', '- ' + amount(order.total_discount)],
    ['Delivery Charge:', '+ ' + amount(order.delivery_charge)],
    ...(order.tax ? [['Tax:', amount(order.tax)]] : []),
    ['Total:', amount(order.total_amount)],
    ['Advance Amount:', amount(order.paid_amount)],
    ['COD:', amount(order.COD)],
  ];
  return <section className={styles.invoice} aria-label="Invoice">
    <div className={styles.invoiceHeader}>
      <div className={styles.brand}>
        <Image src={adminPath('/production-admin/griipbuddy-mark-black.png')} alt="Griipbuddy Logo" width={48} height={48} unoptimized/>
        <p>Griipbuddy</p>
      </div>
      <div className={styles.identity}>
        <h1>ORDER ID: {orderNumber(order)}</h1>
        <p>Invoice: {order.invoice_number}</p>
        <span className={styles.badge} data-status={order.status}>{(order.status || 'Unknown').replaceAll('_', ' ')}</span>
      </div>
    </div>
    <div className={styles.billing}>
      <h2>BILL TO:</h2>
      <p>Name: {order.customer_name}</p>
      <p>Phone: {order.customer_phone}</p>
      <div className={styles.address}>
        <span>Address: {order.delivery_address?.address},</span>
        <span>Upazila: {order.delivery_address?.thana},</span>
        <span>District: {order.delivery_address?.district},</span>
        <span>Division: {order.delivery_address?.division}</span>
      </div>
    </div>
    <div className={styles.summary}>
      {order.order_date && <div><p>Order Date:</p><p>{orderDate(order.order_date, region)}</p></div>}
      <div><p>Payment Type:</p><p>{order.payment_type?.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</p></div>
    </div>
    {payment ?? (order.payment && <section className={styles.payment}>
      <button type="button" onClick={openPayment}>Payment Info:</button>
      <p>Payment Amount: {money(order.payment.amount, currency)}</p>
      <p>Payment Date: {order.payment.date ? orderDate(order.payment.date, region) : 'N/A'}</p>
      <p>Transaction Id: {order.payment.reference}</p>
      <p>Transaction Status: {order.payment.status}</p>
    </section>)}
    <div className={styles.tableScroll}>
      <table className={styles.lineItems}>
        <thead><tr>{['Product', 'Quantity', 'Unit Price', 'Amount'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{order.products.map((line, index) => <tr key={index}>
          <th scope="row">
            <p>{line.name || 'Product'}{line.attributes?.length ? ' (' + line.attributes.join(' - ') + ')' : ''}</p>
            <small>SKU: {line.sku}</small>
            {!!line.barcodes?.length && <div className={styles.barcodes}><span>Assigned:</span>
              {line.barcodes.map((barcode, index) => <code key={barcode + '-' + index}>{barcode}</code>)}
            </div>}
          </th>
          <td>{line.quantity}</td><td>{amount(line.snapshotUnitPrice ?? line.unitPrice)}</td><td>{amount(line.amount)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <dl className={styles.totals}>
      {totals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <section className={styles.logs}>
      <h2>Order Logs</h2>
      {order.activity.length > 0 ? <div className={styles.orderLogList}>{order.activity.map((log, index) => <article key={index}>
        <p>By: {log.by || 'System'}</p><p>{log.text}</p><small>{log.at ? orderDate(log.at, region) : 'No timestamp'}</small>
      </article>)}</div> : <p>No logs found.</p>}
      <h2>Discount Logs</h2>
      {order.discounts.length > 0 ? <div className={styles.discountLogList}>{order.discounts.map((discount, index) => <article key={index}>
        <p>Discount Type: {discount.type || 'N/A'} — Amount: {amount(discount.amount ?? 0)}</p>
        {!!discount.at && <small>Applied At: {orderDate(discount.at, region)}</small>}
      </article>)}</div> : <p>No discount logs found.</p>}
    </section>
    <footer className={styles.invoiceFooter}><p><span>Support:</span> 01871-087090</p><p>contact@griipbuddy.com</p></footer>
  </section>;
}

export function ProductionWebsiteOrderDetail({ order, access, locations, region, back, openEdit, editHref, integrations, managedOperations = false }: Props) {
  const router = useRouter();
  const managed = useManagedOrder(order._id, managedOperations);
  const actions = orderActions(order, access, region);
  if (access.update && managed.data?.contactEditable) actions.unshift({ kind: 'edit', label: 'Edit Order', group: 'Order' });
  const [dialog, setDialog] = useState<OrderDialogKind | undefined>(openEdit && actions.some(action => action.kind === 'edit') ? 'edit' : undefined);
  const [notice, setNotice] = useState('');
  function selectAction(kind: OrderDialogKind) {
    if (kind === 'edit' && editHref) router.push(editHref);
    else setDialog(kind);
  }
  const contacts = [
    ['Name:', order.customer_name], ['Phone:', order.customer_phone], ['District:', order.delivery_address?.district],
    ['Thana:', order.delivery_address?.thana], ['Full Address:', order.delivery_address?.address],
  ];
  return <div className={styles.detail}>
    <div className={styles.return}><Link href={back}><ChevronLeft size={16}/> Back to Orders</Link></div>
    {!!(managed.notice || notice) && <p role="status" className="notice">{managed.notice || notice}</p>}
    <div className={styles.grid}>
      <Invoice order={order} region={region} openPayment={() => setDialog('payment')}
        payment={managed.data?.payment ? <ProductionManagedPayment operations={managed} editable={access.update}
          priorReference={order.payment?.reference} priorDate={order.payment?.date && orderDate(order.payment.date, region)}/> : undefined}/>
      <aside className={styles.sidebar} aria-label="Order operations">
        <section className={styles.card}>
          <div className={styles.actions}>
            <h2>Actions</h2>
            <button type="button" onClick={() => setDialog('actions')}>Order Actions</button>
            <button type="button" onClick={() => window.print()}>Print Invoice <Printer size={16}/></button>
          </div>
        </section>
        {managedOperations && <ProductionManagedShipments operations={managed} editable={access.update} canReturn={access.return}/>}
        <section className={styles.card}>
          <h2 className={styles.cardHeading}>Customer Info</h2>
          <div className={styles.contact}>
            {contacts.map(([label, value]) => <p key={label}><span>{label}</span> {value || 'N/A'}</p>)}
          </div>
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardHeading}>Executive Notes</h2>
          <div className={styles.notes}>{order.notes.length ? order.notes.map((note, index) => <article key={index}>
            <p>{note.text}</p><div><small>Added By: {note.by || 'System'}</small><small>{orderDate(note.at, region)}</small></div>
          </article>) : <p>No Note Found!</p>}</div>
        </section>
        {!managedOperations && (integrations.shipments || integrations.payments || integrations.receipt) && <section className={styles.card}>
          <h2 className={styles.cardHeading}>Fulfillment</h2>
          <div className={styles.integrations}>
            {integrations.shipments && <Link href={integrations.shipments}>Manage shipments</Link>}
            {integrations.payments && <Link href={integrations.payments}>Manage payments</Link>}
            {integrations.receipt && <Link href={integrations.receipt}>Review checkout receipt</Link>}
          </div>
        </section>}
      </aside>
    </div>
    {dialog && <OrderDialog key={dialog} state={{ kind: dialog, order, actions }}
      region={region} locations={locations} close={() => setDialog(undefined)} change={selectAction}
      saved={message => { setDialog(undefined); setNotice(message); router.refresh(); }}/>}
  </div>;
}
