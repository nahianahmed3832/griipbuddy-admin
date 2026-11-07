'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, ExternalLink, Package, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { currencyFor, manualStatuses, money, orderDate, orderNumber, orderRequest, ordersApi, ordersPath,
  statusLabel, type CustomerHistory, type Order } from '@/lib/website-orders';
import { Badge } from './tables';

type ReadKind = 'history' | 'payment' | 'status' | 'tracking';
export type OrderDialogKind = ReadKind | 'actions' | 'track' | 'fraud' | 'edit' | 'update-status' | 'note' | 'sms'
  | 'delivered' | 'return' | 'pending-return' | 'cancel' | 'called';
export type DialogState = { kind: 'sync'; ids: string[] } |
  { kind: OrderDialogKind; order: Order; href?: string; actions?: [OrderDialogKind, string][] };
const titles: Record<DialogState['kind'], string> = {
  actions: 'Order Actions', history: 'Customer Details', payment: 'Payment Information', status: 'Status Logs', tracking: 'Tracking Logs',
  track: 'Track Order', fraud: 'Fraud Check', edit: 'Edit Order', 'update-status': 'Update Status', note: 'Update Note',
  sms: 'Send SMS', delivered: 'Mark as Delivered', return: 'Return Order', 'pending-return': 'Mark as Pending Return',
  cancel: 'Cancel Order', called: 'Record Customer Call', sync: 'Sync with Courier',
};
const readKinds = ['history', 'payment', 'status', 'tracking'];
const mutationMessage: Partial<Record<DialogState['kind'], string>> = {
  edit: 'Order details updated.', 'update-status': 'Order status updated.', note: 'Staff note added.', sms: 'SMS sent.',
  delivered: 'Order marked as delivered.', return: 'Scanned items returned.', 'pending-return': 'Order marked as pending return.',
  cancel: 'Order cancelled.', called: 'Customer call recorded.',
};
const targets: Partial<Record<DialogState['kind'], string>> = { delivered: 'DELIVERED', 'pending-return': 'PENDING_RETURN', cancel: 'CANCELLED' };

type Payment = {
  currency?: string; payment_type?: string; total_amount?: number; COD?: number; paid_amount?: number; paid_by_courier?: number;
  payment_info?: { method?: string; status?: string }; workspace_proof_present?: boolean;
  manual_payment_info?: { sender_number?: string; trxId?: string; paid_amount?: number; files?: string[] };
};
type Tracking = {
  code?: string; parcel?: number;
  observations: { checked_at?: string; courier_status?: string; order_status?: string }[];
  milestones: { status: string; changed_at?: string }[];
  shipments: { _id: string; provider?: string; state?: string; tracking?: string }[];
  events: { _id: string; status?: string; at?: string; detail?: string }[];
};
type StatusLog = { _id?: string; status?: string; changed_at?: string; changed_by?: { full_name?: string } };
type Fraud = { status_tag?: string; success_rate?: number; required_delivery_charge?: boolean };

function Customer({ data, region, onPage }: { data: CustomerHistory; region: Region; onPage: (page: number) => void }) {
  return <>
    <div className="website-customer-hero">
      <span className="website-customer-icon"><UserRound size={24}/></span>
      <div><strong>{data.name || 'Customer'}</strong><small>{data.phone || 'No phone on file'}</small></div>
      {data.total > 1 && <Badge value="Repeat customer"/>}
    </div>
    {data.totals.map(totals => <div className="website-customer-summary" key={totals._id}>
      {[
        ['Total Orders', totals.orders.toLocaleString('en')], ['Order Value', money(totals.value, totals._id)],
        ['COD Total', money(totals.cod, totals._id)], ['Paid Amount', money(totals.paid, totals._id)],
      ].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>)}
    <div className="website-history-heading"><h3><Package size={18}/> Order History ({data.total})</h3><small>Most recent first</small></div>
    {data.orders.map(order => {
      const currency = currencyFor(order.currency, region);
      const balance = order.total_amount !== undefined && order.paid_amount !== undefined ? Math.max(0, order.total_amount - order.paid_amount) : undefined;
      return <article key={order._id} className="website-history-order">
        <header><div><Link className="table-link" href={ordersPath + '/' + order._id + '?region=' + region}>Order {orderNumber(order)}</Link>
          {' '}<Badge value={order.status || 'Unknown'}/><small>{orderDate(order.order_date || order.createdAt, region)}</small></div>
          <div><small>Total</small><strong>{money(order.total_amount, currency)}</strong></div></header>
        <dl className="website-data-list"><div><dt>COD</dt><dd>{money(order.COD, currency)}</dd></div>
          <div><dt>Paid</dt><dd>{money(order.paid_amount, currency)}</dd></div>
          <div><dt>Items</dt><dd>{order.products.reduce((sum, item) => sum + (item.quantity || 0), 0)}</dd></div>
          <div><dt>Balance</dt><dd>{money(balance, currency)}</dd></div></dl>
        <ul className="website-history-products">{order.products.map((item, index) => <li key={index}>
          <span>{item.name || item.sku || 'Item'} × {item.quantity ?? '—'}</span>{item.sku && <small>SKU: {item.sku}</small>}</li>)}</ul>
      </article>;
    })}
    {data.total > data.size && <div className="pagination"><span>Page {data.page}</span><div>
      <button type="button" className="button secondary" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ArrowLeft size={15}/> Previous</button>
      <button type="button" className="button secondary" disabled={data.page * data.size >= data.total} onClick={() => onPage(data.page + 1)}>Next <ArrowRight size={15}/></button>
    </div></div>}
  </>;
}

function PaymentDetails({ data, region, id }: { data: Payment; region: Region; id: string }) {
  const currency = currencyFor(data.currency, region);
  const fields = [
    ['Payment type', data.payment_type && statusLabel(data.payment_type)], ['Payment status', data.payment_info?.status && statusLabel(data.payment_info.status)],
    ['Order total', money(data.total_amount, currency)], ['Total paid', money(data.paid_amount, currency)],
    ['Cash on delivery', money(data.COD, currency)], ['Paid by courier', money(data.paid_by_courier, currency)],
    ['Recorded advance', money(data.manual_payment_info?.paid_amount, currency)], ['Sender number', data.manual_payment_info?.sender_number],
    ['Transaction ID', data.manual_payment_info?.trxId],
  ];
  const legacyFiles = (data.manual_payment_info?.files || []).flatMap(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? [url.href] : [];
    } catch { return []; }
  });
  return <>
    <dl className="website-data-list">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
    {data.workspace_proof_present && <a className="button secondary" href={ordersApi('proof', region, { id })}
      target="_blank" rel="noreferrer">View Payment Screenshot <ExternalLink size={14}/></a>}
    {!!legacyFiles.length && <div className="page-actions">{legacyFiles.slice(0, 10).map((file, index) =>
      <a key={index} className="button secondary" href={file} target="_blank" rel="noreferrer">
        Legacy payment attachment {index + 1} <ExternalLink size={14}/>
      </a>)}</div>}
  </>;
}
function TrackingDetails({ data, region }: { data: Tracking; region: Region }) {
  return <>
    {data.code && <p>Tracking code: <strong>{data.code}</strong></p>}
    {data.shipments.map(shipment => <p key={shipment._id}>Shipment {shipment.tracking || shipment._id}: {statusLabel(shipment.state || 'Unknown')}</p>)}
    {!data.observations.length && !data.milestones.length && !data.events?.length && <p>No tracking events recorded yet.</p>}
    {(!!data.observations.length || !!data.events?.length) && <ul className="website-log">
      {data.observations.map((item, index) => <li key={index}><strong>{statusLabel(item.courier_status || 'Unknown')}</strong>
        <small>{orderDate(item.checked_at, region)} · Courier sync</small></li>)}
      {data.events?.map(item => <li key={item._id}><strong>{statusLabel(item.status || 'Unknown')}</strong>
        <small>{orderDate(item.at, region)}{item.detail ? ' · ' + item.detail : ''}</small></li>)}
    </ul>}
    {!!data.milestones.length && <><h3>Order milestones</h3><ul className="website-log">
      {data.milestones.map((item, index) => <li key={index}><strong>{statusLabel(item.status)}</strong><small>{orderDate(item.changed_at, region)}</small></li>)}
    </ul></>}
  </>;
}

export function OrderDialog({ state, region, close, change, saved }: {
  state: DialogState; region: Region; close: () => void; change: (kind: OrderDialogKind) => void; saved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const heading = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [load, setLoad] = useState<{ page: number; data?: unknown; error?: string }>();
  const kind = state.kind;
  const order = 'order' in state ? state.order : undefined;
  const id = order?._id;
  const read = readKinds.includes(kind);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  useEffect(() => {
    if (!read || !id) return;
    const controller = new AbortController();
    orderRequest(kind, region, { query: { id, page: String(page) }, signal: controller.signal })
      .then(data => setLoad({ page, data }))
      .catch(error => { if (!controller.signal.aborted) setLoad({ page, error: String(error.message) }); });
    return () => controller.abort();
  }, [id, kind, page, read, region]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (state.kind === 'sync') {
        const data = await orderRequest<{ synced: number; failed: number; skipped: number }>('sync', region, { values: { ids: state.ids } });
        saved(`Courier sync: ${data.synced} refreshed, ${data.failed} failed, ${data.skipped} no longer eligible.`);
      } else if (kind === 'return' && !order?.scanReturn) {
        await orderRequest('return-untracked', region, { query: { id }, values: {} });
        saved('Order returned.');
      } else if (kind === 'return') {
        const response = await fetch(adminPath('/api/operations'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'order-return', recordId: id, region, values: { barcodes: fields.barcodes } }) });
        if (!response.ok) throw new Error((await response.text()).slice(0, 320));
        saved(mutationMessage.return!);
      } else if (kind === 'fraud') {
        const data = await orderRequest<Fraud>(kind, region, { query: { id }, values: {} });
        setLoad({ page, data });
      } else if (mutationMessage[kind]) {
        const action = targets[kind] ? 'update-status' : kind;
        const values = kind === 'edit' ? { customer_name: fields.customer_name, customer_phone: fields.customer_phone, order_note: fields.order_note,
          delivery_address: { address: fields.address, thana: fields.thana, district: fields.district, division: fields.division } }
          : kind === 'sms' ? { message: fields.message, phone: order?.customer_phone }
            : targets[kind] ? { status: targets[kind] } : fields;
        await orderRequest(action, region, { query: { id }, values });
        saved(mutationMessage[kind]!);
      }
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'The request failed. Check the order before retrying.');
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }
  const readData = load?.page === page ? load.data : undefined;
  const readError = load?.page === page ? load.error : undefined;
  const fraud = load?.data as Fraud | undefined;
  const actionForm = kind !== 'actions' && kind !== 'track' && !read;
  return <dialog className={`form-dialog website-dialog${kind === 'history' ? ' website-history-dialog' : ''}`} ref={dialog}
    aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busyRef.current) close(); }}>
    <div className="website-dialog-header"><div><h2 id={heading}>{titles[kind]}</h2>{order && <small>Order {orderNumber(order)}</small>}</div>
      <button type="button" aria-label="Close dialog" className="button secondary" disabled={busy} onClick={close}><X size={18}/></button></div>
    {read && !readData && <p role={readError ? 'alert' : 'status'} className={readError ? 'notice warn' : 'muted'}>{readError || 'Loading…'}</p>}
    {kind === 'history' && !!readData && <Customer data={readData as CustomerHistory} region={region} onPage={setPage}/>}
    {kind === 'payment' && !!readData && id && <PaymentDetails data={readData as Payment} region={region} id={id}/>}
    {kind === 'status' && !!readData && ((readData as StatusLog[]).length
      ? <ul className="website-log">{(readData as StatusLog[]).map((entry, index) => <li key={entry._id || index}>
        <Badge value={entry.status || 'Unknown'}/><small>{orderDate(entry.changed_at, region)} · {entry.changed_by?.full_name || 'System'}</small></li>)}</ul>
      : <p>No status changes recorded.</p>)}
    {kind === 'tracking' && !!readData && <TrackingDetails data={readData as Tracking} region={region}/>}
    {kind === 'track' && order && <div className="stack-form">
      <p>Tracking code: <strong>{order.tracking_code}</strong></p>
      {region === 'BD' && <a className="button secondary" href="https://www.steadfast.com.bd/tracking" target="_blank" rel="noreferrer">
        Open Steadfast tracking <ExternalLink size={14}/></a>}
      <button className="button secondary" onClick={() => change('tracking')}>View Tracking Logs</button>
    </div>}
    {state.kind === 'actions' && <div className="website-action-list">
      <Link className="button secondary" href={state.href || ordersPath} onClick={close}>View Details</Link>
      {state.actions?.map(([action, label]) => <button key={action} type="button"
        className={'button secondary' + (['cancel', 'return'].includes(action) ? ' website-danger' : '')} onClick={() => change(action)}>{label}</button>)}
    </div>}
    {actionForm && <form className="stack-form" onSubmit={submit}>
      {state.kind === 'sync' && <p>Refresh tracking for {state.ids.length} eligible orders on this page.</p>}
      {kind === 'called' && <p>Record that you called {order?.customer_name || 'this customer'}.</p>}
      {kind === 'cancel' && <p>Cancel this order and release any reserved stock.</p>}
      {kind === 'delivered' && <p>Confirm the courier has delivered this order.</p>}
      {kind === 'pending-return' && <p>Flag this order as pending return for staff review.</p>}
      {kind === 'edit' && <>
        <div className="website-form-grid">
          <label>Customer name<input name="customer_name" defaultValue={order?.customer_name} maxLength={120} required/></label>
          <label>Customer phone<input name="customer_phone" type="tel" defaultValue={order?.customer_phone} pattern="01[0-9]{9}" required/></label>
        </div>
        <label>Delivery address<textarea name="address" defaultValue={order?.delivery_address?.address} maxLength={450} required/></label>
        <div className="website-form-grid three">
          <label>Division<input name="division" defaultValue={order?.delivery_address?.division} maxLength={80}/></label>
          <label>District<input name="district" defaultValue={order?.delivery_address?.district} maxLength={80}/></label>
          <label>Thana<input name="thana" defaultValue={order?.delivery_address?.thana} maxLength={80}/></label>
        </div>
        <label>Delivery notes<textarea name="order_note" defaultValue={order?.order_note} maxLength={1000}/></label>
      </>}
      {kind === 'note' && <label>Staff note<textarea name="note" rows={4} maxLength={1000} required/></label>}
      {kind === 'sms' && <><p>Send an SMS to <strong>{order?.customer_phone}</strong>.</p>
        <label>Message<textarea name="message" rows={4} maxLength={480} required/></label></>}
      {kind === 'return' && (order?.scanReturn ? <><p>Scan only the returned items. Eligible units will be restored to stock.</p>
        <label>Scanned barcodes<textarea name="barcodes" rows={4} maxLength={2000} required placeholder="One barcode per line"/></label></>
        : <p>Confirm all items in this order were returned. Eligible units will be restored to stock.</p>)}
      {kind === 'update-status' && <label>New status<select name="status" defaultValue="" required>
        <option value="" disabled>Select status</option>{manualStatuses.filter(status => status !== order?.status).map(status =>
          <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>}
      {kind === 'fraud' && (fraud ? <dl className="website-data-list">
        <div><dt>Delivery success</dt><dd>{fraud.success_rate ?? '—'}{fraud.success_rate != null && '%'}</dd></div>
        <div><dt>Provider result</dt><dd>{fraud.status_tag || '—'}</dd></div>
        <div><dt>Advance delivery charge</dt><dd>{fraud.required_delivery_charge ? 'Required' : 'Not required'}</dd></div>
      </dl> : <p>Check delivery history for {order?.customer_phone} with the configured courier fraud service.</p>)}
      {error && <p role="alert" className="notice warn">{error}</p>}
      <div className="page-actions website-dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={close}>{fraud ? 'Done' : 'Close'}</button>
        {!fraud && <button className="button primary" disabled={busy}>{busy ? 'Working…' : kind === 'fraud' ? 'Run Fraud Check'
          : kind === 'sms' ? 'Send SMS' : kind === 'cancel' ? 'Cancel Order' : kind === 'sync' ? 'Sync orders' : 'Confirm'}</button>}
      </div>
    </form>}
  </dialog>;
}
