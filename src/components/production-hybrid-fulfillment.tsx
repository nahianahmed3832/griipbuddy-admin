'use client';

import { useState } from 'react';
import { hybridFulfillmentActions, hybridStatusLabels, type HybridFulfillment, type HybridTrackingStep } from '@/lib/hybrid-fulfillment';
import { money, orderDate } from '@/lib/website-orders';
import { confirmed, field, useHybridOrderCommand } from './production-hybrid-order-commands';
import styles from './production-website-order-detail.module.css';

export function ProductionHybridFulfillment({ orderId, state }: { orderId: string; state: HybridFulfillment }) {
  const { submit, notice, disabled } = useHybridOrderCommand(orderId);
  const [simulatedHandoff, setSimulatedHandoff] = useState(true);
  const { step, shipment, receipt, payment, warehouseChoices = [] } = state;
  const actions = hybridFulfillmentActions(state);
  const next = actions.next;
  const simulated = shipment?.source === 'DEV_SIMULATOR';
  const amount = payment ? money(payment.amountMinor / 100, 'BDT') : '';

  return <section className={styles.card} aria-label="Fulfillment">
    <h2 className={styles.cardHeading}>Fulfillment</h2>
    <div className={`${styles.shipmentOperations} ${styles.hybridFulfillment}`}>
      <p>Status: <strong>{state.status === 'CANCELLED' ? 'Cancelled' : hybridStatusLabels[shipment?.status ?? step] ?? step}</strong></p>
      {state.shippingWarehouse && <dl><div><dt>Shipping warehouse</dt><dd>{state.shippingWarehouse}</dd></div></dl>}
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
      {state.returnCostReceipts?.map(receipt => {
        const label = receipt.caseId ? 'Customer return' : 'Refused parcel';
        return <div key={receipt.caseId || 'refused-parcel'}>
          {receipt.caseId && <p>{label} received {orderDate(receipt.receivedAt, 'BD')}. {receipt.quantity} {receipt.quantity === 1 ? 'unit' : 'units'} returned to stock.</p>}
          {receipt.cost ? <p>Returned cost: {money(receipt.cost.amountMinor / 100, 'BDT')}
            {receipt.cost.evidenceReference && <> · Purchase reference: {receipt.cost.evidenceReference}</>}</p>
            : state.canRecordReturnCost && <form method="post" className={styles.operationForm} aria-label={label + ' cost'} onSubmit={event => void submit(event, fields => ({
              action: 'record-return-cost', caseId: receipt.caseId, amountMinor: Math.round(Number(field(fields, 'returnCost')) * 100),
              evidence: field(fields, 'purchaseReference'),
            }))}>
              <label>Returned purchase cost (BDT)<input name="returnCost" type="number" min="0" max="21474836.47" step="0.01" required disabled={disabled}/></label>
              <label>Purchase or lot reference<input name="purchaseReference" minLength={3} maxLength={120} required disabled={disabled}/></label>
              <button type="submit" className={styles.operationButton} disabled={disabled}>Record return cost</button>
            </form>}
        </div>;
      })}
      {notice && <p role={notice.error ? 'alert' : 'status'} className="notice">{notice.message}</p>}
      {next && <form method="post" className={styles.operationForm} key={next} onSubmit={event => void submit(event, fields => ({ action: 'advance', next,
        ...(next === 'SHIPPED' && { warehouseId: field(fields, 'warehouseId'), ...(simulatedHandoff ? { simulate: true }
          : { carrier: field(fields, 'carrier'), trackingReference: field(fields, 'trackingReference') }) }) }))}>
        {next === 'SHIPPED' && <>
          <label>Shipping warehouse<select name="warehouseId" required disabled={disabled || !warehouseChoices.length} defaultValue="">
            <option value="" disabled>Select warehouse</option>
            {warehouseChoices.map(warehouse => <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>)}
          </select></label>
          {!warehouseChoices.length && <p role="status">No active shipping warehouses are available for this account.</p>}
          <label className={styles.hybridChoice}><input type="checkbox" checked={simulatedHandoff} disabled={disabled}
            onChange={event => setSimulatedHandoff(event.target.checked)}/> Use demo courier</label>
          {!simulatedHandoff && <>
            <label>Carrier<input name="carrier" maxLength={60} required disabled={disabled}/></label>
            <label>Tracking reference<input name="trackingReference" maxLength={80} required disabled={disabled}/></label>
          </>}
        </>}
        <button type="submit" className={styles.operationButton} disabled={disabled || next === 'SHIPPED' && !warehouseChoices.length}>Mark {hybridStatusLabels[next].toLowerCase()}</button>
      </form>}
      {actions.track.length > 0 && <form method="post" className={styles.operationForm} key={shipment?.status} onSubmit={event => void submit(event, fields => ({ action: 'track',
        status: field(fields, 'status') as HybridTrackingStep, ...(!simulated && { evidence: field(fields, 'evidence') }) }))}>
        <label>Tracking status<select name="status" required disabled={disabled} defaultValue="">
          <option value="" disabled>Select status</option>
          {actions.track.map(status => <option value={status} key={status}>{hybridStatusLabels[status]}</option>)}
        </select></label>
        {!simulated && <label>Courier evidence reference<input name="evidence" minLength={3} maxLength={200} required disabled={disabled}/></label>}
        <button type="submit" className={styles.operationButton} disabled={disabled}>Record tracking status</button>
      </form>}
      {actions.receive && <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'receive',
        disposition: field(fields, 'disposition') === 'RESTOCK' ? 'RESTOCK' : 'HOLD', note: field(fields, 'note') }))}>
        <label>Returned stock<select name="disposition" required disabled={disabled} defaultValue="">
          <option value="" disabled>Select stock disposition</option><option value="RESTOCK">Return items to stock</option>
          <option value="HOLD">Hold for inspection</option>
        </select></label>
        <label>Warehouse note<textarea name="note" minLength={3} maxLength={500} required disabled={disabled}/></label>
        <button type="submit" className={styles.operationButton} disabled={disabled}>Receive refused parcel</button>
      </form>}
      {actions.collect && <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'collect', confirm: confirmed(fields) }))}>
        <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={disabled}/>
          Confirm the courier collected {amount}.</label>
        <button type="submit" className={styles.operationButton} disabled={disabled}>Record collection</button>
      </form>}
      {actions.cancel && <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'cancel', confirm: confirmed(fields) }))}>
        <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={disabled}/>
          Cancel this order and return its items to stock.</label>
        <button type="submit" className={styles.operationButton} disabled={disabled}>Cancel order</button>
      </form>}
      {actions.manualPayment && <>
        <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'approve-wallet', amountMinor: Math.round(Number(field(fields, 'amount')) * 100),
          transaction: field(fields, 'transaction'), confirm: confirmed(fields) }))}>
          <label>Amount received (BDT)<input name="amount" type="number" min="0.01" max="21474836.47" step="0.01" required disabled={disabled}/></label>
          <label>Verified transaction ID<input name="transaction" defaultValue={actions.manualPayment.transaction ?? ''}
            minLength={6} maxLength={32} required disabled={disabled}/></label>
          <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={disabled}/>
            Confirm test verification.</label>
          <button type="submit" className={styles.operationButton} disabled={disabled}>Approve wallet payment</button>
        </form>
        <form method="post" className={styles.operationForm} onSubmit={event => void submit(event, fields => ({ action: 'decline-wallet', note: field(fields, 'note'), confirm: confirmed(fields) }))}>
          <label>Reason for declining<textarea name="note" minLength={3} maxLength={300} required disabled={disabled}/></label>
          <label className={styles.hybridChoice}><input name="confirm" value="yes" type="checkbox" required disabled={disabled}/>
            Cancel the order and return its items to stock.</label>
          <button type="submit" className={styles.operationButton} disabled={disabled}>Decline and cancel order</button>
        </form>
      </>}
    </div>
  </section>;
}
