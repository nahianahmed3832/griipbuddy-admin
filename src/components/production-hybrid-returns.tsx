'use client';

import { useRef } from 'react';
import {
  hybridReturnReasons, type HybridFulfillment, type HybridReturnCase, type HybridReturnDisposition, type HybridReturnStatus,
} from '@/lib/hybrid-fulfillment';
import { money, orderDate, statusLabel, type OrderDetail } from '@/lib/website-orders';
import { confirmed, field, useHybridOrderCommand } from './production-hybrid-order-commands';
import styles from './production-website-order-detail.module.css';

type Commands = ReturnType<typeof useHybridOrderCommand>;
type Operations = NonNullable<HybridFulfillment['operations']>;
const reviewTransitions: Record<string, HybridReturnStatus[]> = {
  OPEN: ['IN_REVIEW'], IN_REVIEW: ['RETURN_APPROVED', 'DECLINED'], RETURN_RECEIVED: ['RESOLVED'],
};
const commandLabels: Record<HybridReturnStatus, string> = {
  IN_REVIEW: 'Start review', RETURN_APPROVED: 'Approve return', DECLINED: 'Decline return', RESOLVED: 'Resolve',
};

function Notice({ notice }: Pick<Commands, 'notice'>) {
  return notice && <p role={notice.error ? 'alert' : 'status'} className="notice">{notice.message}</p>;
}

export function HybridContactEditor({ order, state }: { order: OrderDetail; state: HybridFulfillment }) {
  const { submit, disabled, notice } = useHybridOrderCommand(order._id);
  const revision = state.operations?.updatedAt;
  if (!state.editable || !revision || state.status !== 'PLACED' ||
    !['UNFULFILLED', 'PACKING', 'READY_TO_SHIP'].includes(state.step)) return null;
  return <details>
    <summary>Edit Order</summary>
    <form key={revision} method="post" className={styles.operationForm} onSubmit={event => void submit(event, data => ({
      action: 'edit-contact', name: field(data, 'name'), phone: field(data, 'phone'), address: field(data, 'address'), revision,
    }))}>
      <label>Customer name<input name="name" defaultValue={order.customer_name} minLength={2} maxLength={120} required disabled={disabled}/></label>
      <label>Customer phone<input name="phone" type="tel" defaultValue={order.customer_phone} required disabled={disabled}/></label>
      <label>Delivery address<textarea name="address" defaultValue={order.delivery_address?.address} maxLength={450} required disabled={disabled}/></label>
      <button type="submit" className={styles.operationButton} disabled={disabled}>Save changes</button>
      <Notice notice={notice}/>
    </form>
  </details>;
}

export function HybridOrderNotes({ orderId }: { orderId: string }) {
  const { submit, disabled, notice } = useHybridOrderCommand(orderId);
  const requestKey = useRef<string | undefined>(undefined);
  return <form method="post" className={styles.operationForm} onSubmit={event => {
    const form = event.currentTarget;
    void submit(event, data => ({ action: 'add-note', note: field(data, 'note'), key: requestKey.current ??= crypto.randomUUID() }),
      () => { requestKey.current = undefined; form.reset(); });
  }}>
    <label>Staff note<textarea name="note" rows={3} maxLength={1000} required disabled={disabled}
      onChange={() => { requestKey.current = undefined; }}/></label>
    <button type="submit" className={styles.operationButton} disabled={disabled}>Update Note</button>
    <Notice notice={notice}/>
  </form>;
}

function ReturnCase({ entry, items, canReturn, paid, submit, disabled }: {
  entry: HybridReturnCase; items: Operations['items']; canReturn: boolean; paid: boolean;
} & Pick<Commands, 'submit' | 'disabled'>) {
  const { id: caseId, revision } = entry;
  const approved = entry.status === 'REFUND_APPROVED' && entry.refundAmountMinor != null
    ? (entry.refundAmountMinor / 100).toFixed(2) : undefined;
  const next = reviewTransitions[entry.status] ?? (entry.status === 'RETURN_APPROVED' && !entry.returnLines.length ? ['RESOLVED'] as const : []);
  const byId = new Map(items.map(item => [item.id, item]));
  return <article className={styles.shipmentOperations}>
    <h3>{statusLabel(entry.status)}</h3>
    <p>{orderDate(entry.createdAt, 'BD')}{entry.reason ? ' · ' + statusLabel(entry.reason) : ''}</p>
    {entry.returnLines.length > 0 && <ul>
      {entry.returnLines.map(line => <li key={line.orderItemId}>{byId.get(line.orderItemId)?.sku || 'Item'} × {line.quantity}</li>)}
    </ul>}
    {entry.returnReceivedAt && <p>Received {orderDate(entry.returnReceivedAt, 'BD')}. {
      entry.returnDisposition === 'RESTOCK' ? 'Returned to stock.' : 'Held for inspection.'
    }</p>}
    {entry.refundConfirmedAt && <p>Refund confirmed {orderDate(entry.refundConfirmedAt, 'BD')} · {money((entry.refundAmountMinor ?? 0) / 100, 'BDT')}</p>}
    {entry.events.some(event => event.note) && <ol aria-label="Return history">
      {entry.events.filter(event => event.note).map((event, index) => <li key={event.createdAt + ':' + index}>
        <span>{event.note}</span><small>{event.actor?.name || 'Customer'} · {orderDate(event.createdAt, 'BD')}</small>
      </li>)}
    </ol>}
    {canReturn && next.length > 0 && <form key={'review:' + revision} method="post" className={styles.operationForm}
      onSubmit={event => void submit(event, data => ({
        action: 'review-return', caseId, revision, status: field(data, 'status') as HybridReturnStatus, note: field(data, 'note'),
      }))}>
      <label>Return status<select name="status" defaultValue={next[0]} disabled={disabled}>
        {next.map(status => <option key={status} value={status}>{commandLabels[status]}</option>)}
      </select></label>
      <label>Review note<textarea name="note" minLength={3} maxLength={1500} rows={2} required disabled={disabled}/></label>
      <button type="submit" className={styles.operationButton} disabled={disabled}>Update return status</button>
    </form>}
    {canReturn && entry.status === 'RETURN_APPROVED' && entry.returnLines.length > 0 && <form method="post" className={styles.operationForm}
      onSubmit={event => void submit(event, data => ({
        action: 'receive-return', caseId, revision, disposition: field(data, 'disposition') as HybridReturnDisposition, confirmed: confirmed(data),
      }))}>
      <label>Returned stock<select name="disposition" required defaultValue={entry.reason === 'DAMAGED' ? 'HOLD' : ''} disabled={disabled}>
        <option value="" disabled>Select stock disposition</option><option value="RESTOCK">Return items to stock</option>
        <option value="HOLD">Hold for inspection</option>
      </select></label>
      <label className={styles.hybridChoice}><input type="checkbox" name="confirm" value="yes" required disabled={disabled}/>Confirm the items were received.</label>
      <button type="submit" className={styles.operationButton} disabled={disabled}>Receive return</button>
    </form>}
    {canReturn && paid && entry.returnReceivedAt && !entry.refundConfirmedAt && entry.returnLines.length > 0 &&
      (['RETURN_RECEIVED', 'RESOLVED'].includes(entry.status) || approved != null) && <form key={'refund:' + revision} method="post" className={styles.operationForm}
        onSubmit={event => void submit(event, data => ({ action: 'confirm-return-refund', caseId, revision,
          amountMinor: Math.round(Number(field(data, 'amount')) * 100), method: field(data, 'method'),
          reference: field(data, 'reference'), confirmed: confirmed(data),
        }))}>
        <label>{approved == null ? 'Refund amount (BDT)' : 'Approved refund amount (BDT)'}
          <input name="amount" type="number" min="0.01" max="21474836.47" step="0.01" required
            defaultValue={approved} readOnly={approved != null} disabled={disabled}/>
        </label>
        <label>Refund method<input name="method" minLength={2} maxLength={60} required disabled={disabled}/></label>
        <label>Payout reference<input name="reference" minLength={2} maxLength={80} required disabled={disabled}/></label>
        <label className={styles.hybridChoice}><input type="checkbox" name="confirm" value="yes" required disabled={disabled}/>Confirm the payout was completed.</label>
        <button type="submit" className={styles.operationButton} disabled={disabled}>Confirm refund</button>
      </form>}
  </article>;
}

export function ProductionHybridReturns({ orderId, state }: { orderId: string; state: HybridFulfillment }) {
  const commands = useHybridOrderCommand(orderId);
  const { submit, disabled, notice } = commands;
  const { operations, payment } = state;
  if (!operations) return null;
  const { cases, items } = operations;
  const canReturn = state.editable && state.canReturn;
  const paid = payment?.status === 'COLLECTED' || payment?.status === 'PAID';
  const received = new Map<string, number>();
  for (const entry of cases) if (entry.returnReceivedAt) for (const line of entry.returnLines) {
    received.set(line.orderItemId, (received.get(line.orderItemId) ?? 0) + line.quantity);
  }
  const eligible = items.map(item => ({ ...item, quantity: item.quantity - (received.get(item.id) ?? 0) })).filter(item => item.quantity > 0);
  const canOpen = canReturn && state.step === 'DELIVERED' && state.status === 'PLACED' && eligible.length > 0 &&
    !cases.some(entry => ['OPEN', 'IN_REVIEW', 'RETURN_APPROVED', 'RETURN_RECEIVED', 'REFUND_APPROVED', 'REFUND_FAILED'].includes(entry.status)
      || entry.status === 'RESOLVED' && !entry.returnLines.length);
  if (!canOpen && !cases.length) return null;
  return <section className={styles.card} aria-label="Customer Returns">
    <h2 className={styles.cardHeading}>Customer Returns</h2>
    <div className={styles.hybridFulfillment}>
      <Notice notice={notice}/>
      {cases.map(entry => <ReturnCase key={entry.id} entry={entry} items={items} canReturn={canReturn} paid={paid} {...commands}/>)}
      {canOpen && <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, data => ({
        action: 'open-return', reason: field(data, 'reason') as keyof typeof hybridReturnReasons, note: field(data, 'note'),
        lines: eligible.flatMap(item => {
          const quantity = Number(field(data, item.id));
          return quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
        }),
      }))}>
        <label>Return reason<select name="reason" defaultValue="" required disabled={disabled}>
          <option value="" disabled>Select reason</option>
          {Object.entries(hybridReturnReasons).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}
        </select></label>
        <fieldset><legend>Return quantities</legend>
          {eligible.map(item => <label key={item.id}>{item.sku || item.productName}
            <input type="number" name={item.id} min={0} max={item.quantity} step={1} defaultValue={0} disabled={disabled}/>
          </label>)}
        </fieldset>
        <label>Return note<textarea name="note" minLength={10} maxLength={1500} rows={2} required disabled={disabled}/></label>
        <button type="submit" className={styles.operationButton} disabled={disabled}>Return Order</button>
      </form>}
    </div>
  </section>;
}
