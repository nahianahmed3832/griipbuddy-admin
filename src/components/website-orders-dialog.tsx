'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Barcode, Check, ClipboardList, ExternalLink, FileText, Flag, MessageSquare, Package, Pencil, RotateCcw,
  Trash2, Truck, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { addressLabel, currencyFor, money, orderDate, orderNumber, orderRequest, ordersApi, ordersPath, orderStatusChoices,
  statusLabel, type CustomerHistory, type Order, type OrderAction, type OrderLocation, type OrderMutation, type OrderNote } from '@/lib/website-orders';
import { Badge } from './tables';
import { OrderFraudResults } from './production-fraud';

type ReadKind = 'history' | 'payment' | 'status' | 'tracking' | 'calls';
export type OrderDialogKind = ReadKind | 'actions' | 'track' | 'fraud' | OrderMutation;
export type DialogState = { kind: 'sync'; ids?: string[] } |
  { kind: OrderDialogKind; order: Order; href?: string; actions?: OrderAction[] };
const titles: Record<DialogState['kind'], string> = {
  actions: 'Order Actions', history: 'Customer Details', payment: 'Payment Information', status: 'Status Logs', tracking: 'Tracking Logs',
  calls: 'Call History', 'accept-stock': 'Accept Order', 'decline-stock': 'Decline Order', accept: 'Accept Order', delete: 'Delete Order',
  track: 'Track Order', fraud: 'Fraud Check', edit: 'Edit Order', 'update-status': 'Update Status', note: 'Update Note',
  sms: 'Send SMS', delivered: 'Mark as Delivered', return: 'Return Order', 'scan-return': 'Scan to Return', 'pending-return': 'Mark as Pending Return',
  cancel: 'Cancel Order', called: 'Record Customer Call', sync: 'Sync with Courier',
  dispatch: 'Send to Courier', handover: 'Mark as Handed Over', pick: 'Assign Barcodes',
};
const actionIcons: Record<OrderMutation, typeof Pencil> = {
  edit: Pencil, 'update-status': ClipboardList, note: FileText, sms: MessageSquare, dispatch: Truck, handover: Truck,
  delivered: Check, return: RotateCcw, 'scan-return': Barcode, 'pending-return': Flag, cancel: X, called: Check, pick: Barcode, delete: Trash2, 'accept-stock': Check, 'decline-stock': X, accept: Check,
};
const buttonLabels: Partial<Record<DialogState['kind'], string>> = {
  note: 'Add note', 'update-status': 'Save status', edit: 'Save changes', sms: 'Send SMS', dispatch: 'Send to Steadfast',
  handover: 'Confirm handover', pick: 'Assign barcodes', cancel: 'Cancel order', delivered: 'Confirm delivery',
  'pending-return': 'Confirm pending return', return: 'Confirm return', 'scan-return': 'Confirm return', sync: 'Sync orders',
  'accept-stock': 'Accept order', 'decline-stock': 'Decline order', accept: 'Accept order', delete: 'Delete order',
};
const readKinds = ['history', 'payment', 'status', 'tracking', 'calls'];
const mutationMessage: Partial<Record<DialogState['kind'], string>> = {
  edit: 'Order details updated.', 'update-status': 'Order status updated.', note: 'Staff note added.', sms: 'SMS sent.',
  delivered: 'Order marked as delivered.', return: 'Scanned items returned.', 'scan-return': 'Scanned items returned.', 'pending-return': 'Order marked as pending return.',
  'accept-stock': 'Order accepted.', 'decline-stock': 'Order declined.', accept: 'Order accepted.', delete: 'Order deleted.',
  cancel: 'Order cancelled.', called: 'Customer call recorded.',
  dispatch: 'Order sent to Steadfast.', handover: 'Courier handover recorded.', pick: 'Barcodes assigned to the order.',
};
const targets: Partial<Record<DialogState['kind'], string>> = { delivered: 'DELIVERED', 'pending-return': 'PENDING_RETURN', cancel: 'CANCELLED', accept: 'ACCEPTED' };

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
type CallLog = { called_by_name?: string; called_at?: string };
type SmsLog = { message: string; phone?: string; status?: string; sent_by_name?: string; sent_at?: string };
type ReturnItems = { revision: number; items: { variant: string; sku?: string; name?: string; quantity: number }[] };
type SyncBatch = { synced: number; failed: number; skipped: number; next?: string };

export function OrderNotes({ notes, region }: { notes: OrderNote[]; region: Region }) {
  return notes.length ? <ul className="website-note-list">{notes.map((note, index) => <li key={index}>
    <p>{note.text || '—'}</p><small>{note.by || 'Staff'} · {orderDate(note.at, region)}</small>
  </li>)}</ul> : <p className="muted">No staff notes yet.</p>;
}

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

export function OrderDialog({ state, region, locations = [], close, change, saved }: {
  state: DialogState; region: Region; locations?: OrderLocation[]; close: () => void; change: (kind: OrderDialogKind) => void; saved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const heading = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState('');
  const [returnKind, setReturnKind] = useState('RETURNED');
  const [syncProgress, setSyncProgress] = useState(0);
  const [load, setLoad] = useState<{ page: number; data?: unknown; error?: string }>();
  const kind = state.kind;
  const order = 'order' in state ? state.order : undefined;
  const id = order?._id;
  const read = readKinds.includes(kind);
  const scanReturn = kind === 'scan-return' || kind === 'return' && !!order?.scanReturn;
  const readAction = kind === 'note' ? 'notes' : kind === 'sms' ? 'sms-history' :
    kind === 'return' && !scanReturn ? 'return-items' : read ? kind : undefined;
  const statusChoices = order ? orderStatusChoices(order) : [];
  const dispatchLocations = order?.assigned_business_location?._id
    ? locations.filter(location => location.value === order.assigned_business_location?._id) : locations;
  useEffect(() => {
    const modal = dialog.current;
    const trigger = document.activeElement;
    if (modal && !modal.open) modal.showModal();
    return () => {
      if (modal?.open) modal.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!readAction || !id) return;
    const controller = new AbortController();
    orderRequest(readAction, region, { query: { id, page: String(page) }, signal: controller.signal })
      .then(data => setLoad({ page, data }))
      .catch(error => { if (!controller.signal.aborted) setLoad({ page, error: String(error.message) }); });
    return () => controller.abort();
  }, [id, page, readAction, region]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (state.kind === 'sync') {
        let synced = 0, failed = 0, skipped = 0;
        let after: string | undefined;
        setSyncProgress(0);
        do {
          const values = state.ids ? { ids: state.ids } : { scope: 'queue', after };
          const data: SyncBatch = await orderRequest('sync', region, { values });
          synced += data.synced;
          failed += data.failed;
          skipped += data.skipped;
          setSyncProgress(synced + failed);
          after = data.next;
        } while (after);
        saved(`Courier sync: ${synced} refreshed, ${failed} failed, ${skipped} no longer eligible.`);
      } else if (kind === 'return' && !scanReturn) {
        const data = load?.data as ReturnItems | undefined;
        if (!data) return;
        const products = returnKind === 'PARTIAL' ? data.items.flatMap(item => {
          const quantity = Number(fields['qty:' + item.variant]);
          if (!quantity) return [];
          return [{ variant: item.variant, quantity, return_note: fields['note:' + item.variant] }];
        }) : undefined;
        if (products && !products.length) { setError('Select at least one returned item.'); return; }
        await orderRequest('return-untracked', region, { query: { id }, values: { status: returnKind, revision: data.revision, products } });
        saved(returnKind === 'PARTIAL' ? 'Partial return recorded.' : 'Order returned.');
      } else if (scanReturn || kind === 'pick') {
        const response = await fetch(adminPath('/api/operations'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: kind === 'pick' ? 'order-pick' : 'order-return', recordId: id, region, values: { barcodes: fields.barcodes } }) });
        if (!response.ok) throw new Error((await response.text()).slice(0, 320));
        saved(mutationMessage[kind]!);
      } else if (mutationMessage[kind]) {
        const action = targets[kind] ? 'update-status' : kind === 'edit' && order?.managed ? 'edit-managed' : kind;
        const values = kind === 'edit' ? { customer_name: fields.customer_name, customer_phone: fields.customer_phone, order_note: fields.order_note,
          delivery_address: { address: fields.address, thana: fields.thana, district: fields.district, division: fields.division } }
          : kind === 'sms' ? { message: fields.message, phone: order?.customer_phone }
            : targets[kind] ? { status: targets[kind] } : fields;
        await orderRequest(action, region, { query: { id }, values });
        saved(mutationMessage[kind]!);
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'The request failed. Check the order before retrying.';
      setError(kind === 'dispatch' ? `${message} If the result is uncertain, check Steadfast for the consignment before retrying.` : message);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }
  const readData = load?.page === page ? load.data : undefined;
  const readError = load?.page === page ? load.error : undefined;
  const returnItems = readAction === 'return-items' ? readData as ReturnItems | undefined : undefined;
  const actionForm = kind !== 'actions' && kind !== 'track' && kind !== 'fraud' && !read;
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
    {kind === 'calls' && !!readData && ((readData as CallLog[]).length
      ? <ul className="website-log">{(readData as CallLog[]).map((call, index) => <li key={index}>
        <strong>{call.called_by_name || 'Staff'}</strong><small>{orderDate(call.called_at, region)}</small></li>)}</ul>
      : <p>No calls recorded.</p>)}
    {kind === 'fraud' && <OrderFraudResults phone={order?.customer_phone}/>}
    {kind === 'tracking' && !!readData && <TrackingDetails data={readData as Tracking} region={region}/>}
    {kind === 'track' && order && <div className="stack-form">
      <p>Tracking code: <strong>{order.tracking_code}</strong></p>
      {region === 'BD' && <a className="button secondary" href="https://www.steadfast.com.bd/tracking" target="_blank" rel="noreferrer">
        Open Steadfast tracking <ExternalLink size={14}/></a>}
      <button className="button secondary" onClick={() => change('tracking')}>View Tracking Logs</button>
    </div>}
    {state.kind === 'actions' && <>
      <div className="website-action-context"><span>{order?.customer_name || 'Customer'}</span><Badge value={order?.status || 'Unknown'}/></div>
      {(['Order', 'Fulfillment', 'Exceptions'] as const).map(group => {
        const actions = state.actions?.filter(action => action.group === group) || [];
        const details = group === 'Order' && state.href;
        return (details || actions.length > 0) && <section key={group} className="website-action-group" aria-label={group}>
          <h3>{group}</h3><div className="website-action-list">
            {details && <Link className="button secondary" href={details} onClick={close}><FileText size={16}/> View Details</Link>}
            {actions.map(({ kind, label }) => { const Icon = actionIcons[kind]; return <button key={kind} type="button"
              className={'button secondary' + (['cancel', 'return'].includes(kind) ? ' website-danger' : '')} onClick={() => change(kind)}><Icon size={16}/> {label}</button>; })}
          </div>
        </section>;
      })}
    </>}
    {actionForm && <form className="stack-form" onSubmit={submit}>
      {state.kind === 'sync' && <p>{state.ids ? 'Refresh tracking for eligible orders on this page.' : 'Refresh tracking for all orders handed over to the courier or in transit.'}
        {busy && !!syncProgress && <span role="status"> {syncProgress} orders checked.</span>}</p>}
      {(kind === 'accept-stock' || kind === 'accept') && <p>Confirm that you want to accept this order.</p>}
      {kind === 'decline-stock' && <label>Reason (optional)<textarea name="reason" maxLength={240} rows={3}/></label>}
      {kind === 'delete' && <label>Type DELETE to confirm<input name="confirmation" required autoComplete="off" value={confirmation}
        onChange={event => setConfirmation(event.currentTarget.value)}/></label>}
      {kind === 'called' && <p>Record that you called {order?.customer_name || 'this customer'}.</p>}
      {kind === 'cancel' && <p>Cancel this order and release any reserved stock.</p>}
      {kind === 'delivered' && <p>Confirm this order was delivered.</p>}
      {kind === 'pending-return' && <p>Flag this order as pending return for staff review.</p>}
      {kind === 'edit' && <>
        <div className="website-form-grid">
          <label>Customer name<input name="customer_name" defaultValue={order?.customer_name} maxLength={120} required/></label>
          <label>Customer phone<input name="customer_phone" type="tel" defaultValue={order?.customer_phone}
            pattern={order?.managed ? String.raw`(?:\+?88)?01[0-9]{9}` : '01[0-9]{9}'} required/></label>
        </div>
        <label>Delivery address<textarea name="address" defaultValue={order?.delivery_address?.address} maxLength={450} required/></label>
        <div className="website-form-grid three">
          <label>Division<input name="division" defaultValue={order?.delivery_address?.division} maxLength={80} readOnly={order?.managed}/></label>
          <label>District<input name="district" defaultValue={order?.delivery_address?.district} maxLength={80} readOnly={order?.managed}/></label>
          <label>Thana<input name="thana" defaultValue={order?.delivery_address?.thana} maxLength={80} readOnly={order?.managed}/></label>
        </div>
        <label>Delivery notes<textarea name="order_note" defaultValue={order?.order_note} maxLength={1000}/></label>
      </>}
      {kind === 'note' && <>
        <label>Staff note<textarea name="note" rows={4} maxLength={1000} required placeholder="Add an update for your team"/></label>
        <p className="muted">Only staff can see these notes.</p>
        <section className="website-note-history" aria-label="Previous staff notes">
          <h3>Previous notes</h3>
          {readData ? <OrderNotes notes={readData as OrderNote[]} region={region}/>
            : <p role={readError ? 'alert' : 'status'} className={readError ? 'notice warn' : 'muted'}>{readError || 'Loading notes…'}</p>}
        </section>
      </>}
      {kind === 'sms' && <><p>Send an SMS to <strong>{order?.customer_phone}</strong>.</p>
        <label>Message<textarea name="message" rows={4} maxLength={480} required/></label>
        <section aria-label="SMS History" className="website-note-history"><h3>SMS History</h3>
          {readData ? (readData as SmsLog[]).length ? <ul className="website-note-list">{(readData as SmsLog[]).map((sms, index) =>
            <li key={index}><p>{sms.message}</p><Badge value={sms.status || 'Unknown'}/>
              <small>{sms.phone} · {sms.sent_by_name || 'Staff'} · {orderDate(sms.sent_at, region)}</small></li>)}</ul>
            : <p>No messages sent.</p> : <p role={readError ? 'alert' : 'status'}>{readError || 'Loading history…'}</p>}
        </section></>}
      {(kind === 'return' || kind === 'scan-return') && (scanReturn ? <><p>Scan only the returned items. Eligible units will be restored to stock.</p>
        <label>Scanned barcodes<textarea name="barcodes" rows={4} maxLength={2000} required placeholder="One barcode per line"/></label></>
        : returnItems ? <>
          <label>Return Status<select value={returnKind} onChange={event => setReturnKind(event.currentTarget.value)}>
            <option value="RETURNED">Full Return</option><option value="PARTIAL">Partial Return</option>
          </select></label>
          {returnKind === 'RETURNED' ? <p>Confirm all remaining items were returned.</p>
            : returnItems.items.map(item => <fieldset key={item.variant} className="website-form-grid">
              <legend>{item.sku || item.name} ({item.quantity} remaining)</legend>
              <label>Quantity returned<input type="number" name={'qty:' + item.variant} min={0} max={item.quantity} step={1} defaultValue={0}/></label>
              <label>Return note<input name={'note:' + item.variant} maxLength={500}/></label>
            </fieldset>)}
        </> : <p role={readError ? 'alert' : 'status'}>{readError || 'Loading return items…'}</p>)}
      {kind === 'pick' && <label>Scanned barcodes<textarea name="barcodes" rows={4} maxLength={2000} required placeholder="One barcode per line"/></label>}
      {kind === 'dispatch' && <>
        <p>Create a Steadfast consignment. Record handover once the parcel physically leaves your warehouse.</p>
        <dl className="website-data-list website-dispatch-summary">
          <div><dt>Recipient</dt><dd>{order?.customer_name || '—'} · {order?.customer_phone || '—'}</dd></div>
          <div><dt>Cash on delivery</dt><dd>{money(order?.COD, currencyFor(order?.currency, region))}</dd></div>
          <div><dt>Delivery address</dt><dd>{addressLabel(order?.delivery_address) || '—'}</dd></div>
        </dl>
        <label>Dispatch warehouse<select name="location" required defaultValue={dispatchLocations.length === 1 ? dispatchLocations[0].value : ''}>
          <option value="" disabled>Select warehouse</option>{dispatchLocations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}
        </select></label>
        {!dispatchLocations.length && <p className="notice warn">The dispatch warehouse is unavailable. Check the assigned location before retrying.</p>}
        <label>Courier note (optional)<textarea name="note" rows={2} maxLength={240}/></label>
      </>}
      {kind === 'handover' && <p>Confirm that parcel {order?.consignment_id} physically left the warehouse with the courier.</p>}
      {kind === 'update-status' && <p>Current status: <Badge value={order?.status || 'Unknown'}/></p>}
      {kind === 'update-status' && <label>New status<select name="status" defaultValue="" required>
        <option value="" disabled>Select status</option>{statusChoices.map(status =>
          <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>}
      {error && <p role="alert" className="notice warn">{error}</p>}
      <div className="page-actions website-dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={close}>Close</button>
        <button className={'button primary' + (['cancel', 'delete', 'decline-stock'].includes(kind) ? ' website-destructive' : '')}
          disabled={busy || (kind === 'return' && !scanReturn && !returnItems) || (kind === 'delete' && confirmation !== 'DELETE') || (kind === 'dispatch' && !dispatchLocations.length)}>{busy ? 'Working…' : buttonLabels[kind] || 'Confirm'}</button>
      </div>
    </form>}
  </dialog>;
}
