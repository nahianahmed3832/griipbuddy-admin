'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { hybridFulfillmentActions, hybridStatusLabels, type HybridCommand, type HybridFulfillment, type HybridTrackingStep } from '@/lib/hybrid-fulfillment';
import { adminPath } from '@/lib/paths';
import { money, orderDate } from '@/lib/website-orders';
import styles from './production-website-order-detail.module.css';

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const confirmed = (form: FormData) => form.get('confirm') === 'yes';

export function ProductionHybridFulfillment({ orderId, state }: { orderId: string; state: HybridFulfillment }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string }>();
  const [simulatedHandoff, setSimulatedHandoff] = useState(true);
  const { step, shipment, receipt, payment } = state;
  const actions = hybridFulfillmentActions(state);
  const next = actions.next;
  const simulated = shipment?.source === 'DEV_SIMULATOR';
  const amount = payment ? money(payment.amountMinor / 100, 'BDT') : '';

  async function submit(event: FormEvent<HTMLFormElement>, request: (data: FormData) => HybridCommand) {
    event.preventDefault();
    if (pending.current) return;
    const command = request(new FormData(event.currentTarget));
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(adminPath('/api/website-orders/fulfillment?' + new URLSearchParams({ id: orderId, region: 'BD' })), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      });
      if (!response.ok) {
        setNotice({ error: true, message: (await response.text()).slice(0, 320) || 'The fulfillment change could not be saved.' });
      } else {
        setNotice({ error: false, message: 'Order updated.' });
        router.refresh();
      }
    } catch {
      setNotice({ error: true, message: 'Could not confirm the fulfillment change. Refresh the order before retrying.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <section className={styles.card} aria-label="Fulfillment">
    <h2 className={styles.cardHeading}>Fulfillment</h2>
    <div className={`${styles.shipmentOperations} ${styles.hybridFulfillment}`}>
      <p>Status: <strong>{state.status === 'CANCELLED' ? 'Cancelled' : hybridStatusLabels[shipment?.status ?? step] ?? step}</strong></p>
      {shipment && <>
        <dl><div><dt>Carrier</dt><dd>{shipment.carrier}</dd></div><div><dt>Tracking reference</dt><dd>{shipment.trackingReference}</dd></div></dl>
        {!!shipment.events?.length && <ol aria-label="Tracking history">{shipment.events.map(event => <li key={event.status}>
          <span>{hybridStatusLabels[event.status] ?? event.status}
            {event.evidence && <small className={styles.hybridEvidence}>Courier evidence: {event.evidence}</small>}
          </span><small>{orderDate(event.recordedAt, 'BD')}</small>
        </li>)}</ol>}
      </>}
      {receipt && <p>Parcel received {orderDate(receipt.receivedAt, 'BD')}. {receipt.disposition === 'RESTOCK'
        ? `${receipt.restockedUnits} ${receipt.restockedUnits === 1 ? 'unit' : 'units'} returned to stock.` : 'Stock held for inspection.'}</p>}
      {receipt?.note && <p className={styles.hybridEvidence}>Warehouse note: {receipt.note}</p>}
      {notice && <p role={notice.error ? 'alert' : 'status'} className="notice">{notice.message}</p>}
      {next && <form className={styles.operationForm} key={next} onSubmit={event => void submit(event, fields => ({ action: 'advance', next,
        ...(next === 'SHIPPED' && (simulatedHandoff ? { simulate: true }
          : { carrier: field(fields, 'carrier'), trackingReference: field(fields, 'trackingReference') })) }))}>
        {next === 'SHIPPED' && <>
          <label className={styles.hybridChoice}><input type="checkbox" checked={simulatedHandoff} disabled={busy}
            onChange={event => setSimulatedHandoff(event.target.checked)}/> Use demo courier</label>
          {!simulatedHandoff && <>
            <label>Carrier<input name="carrier" maxLength={60} required disabled={busy}/></label>
            <label>Tracking reference<input name="trackingReference" maxLength={80} required disabled={busy}/></label>
          </>}
        </>}
        <button type="submit" className={styles.operationButton} disabled={busy}>Mark {hybridStatusLabels[next].toLowerCase()}</button>
      </form>}
      {actions.track.length > 0 && <form className={styles.operationForm} key={shipment?.status} onSubmit={event => void submit(event, fields => ({ action: 'track',
        status: field(fields, 'status') as HybridTrackingStep, ...(!simulated && { evidence: field(fields, 'evidence') }) }))}>
        <label>Tracking status<select name="status" required disabled={busy} defaultValue="">
          <option value="" disabled>Select status</option>
          {actions.track.map(status => <option value={status} key={status}>{hybridStatusLabels[status]}</option>)}
        </select></label>
        {!simulated && <label>Courier evidence reference<input name="evidence" minLength={3} maxLength={200} required disabled={busy}/></label>}
        <button type="submit" className={styles.operationButton} disabled={busy}>Record tracking status</button>
      </form>}
      {actions.receive && <form className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'receive',
        disposition: field(fields, 'disposition') === 'RESTOCK' ? 'RESTOCK' : 'HOLD', note: field(fields, 'note') }))}>
        <label>Returned stock<select name="disposition" required disabled={busy} defaultValue="">
          <option value="" disabled>Select stock disposition</option><option value="RESTOCK">Return items to stock</option>
          <option value="HOLD">Hold for inspection</option>
        </select></label>
        <label>Warehouse note<textarea name="note" minLength={3} maxLength={500} required disabled={busy}/></label>
        <button type="submit" className={styles.operationButton} disabled={busy}>Receive refused parcel</button>
      </form>}
      {actions.collect && <form className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'collect', confirm: confirmed(fields) }))}>
        <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={busy}/>
          Confirm the courier collected {amount}.</label>
        <button type="submit" className={styles.operationButton} disabled={busy}>Record collection</button>
      </form>}
      {actions.cancel && <form className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'cancel', confirm: confirmed(fields) }))}>
        <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={busy}/>
          Cancel this order and return its items to stock.</label>
        <button type="submit" className={styles.operationButton} disabled={busy}>Cancel order</button>
      </form>}
      {actions.manualPayment && <>
        <form className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'approve-wallet', amountMinor: Math.round(Number(field(fields, 'amount')) * 100),
          transaction: field(fields, 'transaction'), confirm: confirmed(fields) }))}>
          <label>Amount received (BDT)<input name="amount" type="number" min="0.01" max="21474836.47" step="0.01" required disabled={busy}/></label>
          <label>Verified transaction ID<input name="transaction" defaultValue={actions.manualPayment.transaction ?? ''}
            minLength={6} maxLength={32} required disabled={busy}/></label>
          <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={busy}/>
            Confirm test verification.</label>
          <button type="submit" className={styles.operationButton} disabled={busy}>Approve wallet payment</button>
        </form>
        <form className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'decline-wallet', note: field(fields, 'note'), confirm: confirmed(fields) }))}>
          <label>Reason for declining<textarea name="note" minLength={3} maxLength={300} required disabled={busy}/></label>
          <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={busy}/>
            Cancel the order and return its items to stock.</label>
          <button type="submit" className={styles.operationButton} disabled={busy}>Decline and cancel order</button>
        </form>
      </>}
    </div>
  </section>;
}
