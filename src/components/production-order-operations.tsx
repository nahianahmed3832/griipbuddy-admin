'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import { useBrowserReady } from '@/lib/browser-ready';
import { money } from '@/lib/website-orders';
import { managedOrderRequest, orderRetryKey, type ManagedMutation, type ManagedOrder, type ReviewLine, type Shipment } from '@/lib/order-managed';
import styles from './production-website-order-detail.module.css';

export function useManagedOrder(order: string, enabled: boolean) {
  const router = useRouter();
  const [data, setData] = useState<ManagedOrder>();
  const [loadingError, setLoadingError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    managedOrderRequest<ManagedOrder>(order, undefined, controller.signal).then(setData).catch(error => {
      if (!controller.signal.aborted) setLoadingError(error.message);
    });
    return () => controller.abort();
  }, [enabled, order]);

  async function save(input: ManagedMutation, message: string) {
    if (!data || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setNotice('');
    const refundAction = input.action === 'refund-reconcile' || input.action === 'payment-action' && input.step === 'refunds';
    try {
      const retry = input.keyed ? await orderRetryKey(order, input) : undefined;
      const result = await managedOrderRequest<{ id?: string; state?: string }>(order, { ...input, market: data.market || 'BD', key: retry?.key });
      setData(await managedOrderRequest<ManagedOrder>(order));
      if (result.state !== 'pending') retry?.clear();
      setNotice(refundAction && result.state === 'pending' ? 'Refund awaiting provider confirmation.'
        : refundAction && result.state === 'failed' ? 'Refund failed. Review its history.' : message);
      router.refresh();
    } catch (error) {
      if (refundAction) {
        const current = await managedOrderRequest<ManagedOrder>(order).catch(() => undefined);
        if (current) setData(current);
      }
      setNotice(error instanceof Error ? error.message : 'Could not complete the order action.');
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }
  return { data, loadingError, saving, notice, save, setNotice };
}

type Operations = ReturnType<typeof useManagedOrder>;
type Form = (fields: FormData, button?: string) => void;
const value = (fields: FormData, name: string) => String(fields.get(name) ?? '').trim();
const scans = (fields: FormData, name: string) => value(fields, name).split(/\s+/).filter(Boolean);
const numeric = (fields: FormData, name: string) => Number(value(fields, name));
const reference = String.raw`[A-Za-z0-9._:\/\-]+`;

function submit(handler: Form) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    handler(new FormData(event.currentTarget), button?.value);
  };
}

function Field({ name, label, required = true, maxLength = 100, withReference = false }: {
  name: string; label: string; required?: boolean; maxLength?: number; withReference?: boolean;
}) {
  return <label>{label}<input name={name} required={required} maxLength={maxLength} pattern={withReference ? reference : undefined}/></label>;
}

function Quantity({ name, label, max, min = 0, initial = 0 }: { name: string; label: string; max: number; min?: number; initial?: number | '' }) {
  return <label>{label}<input type="number" name={name} min={min} max={max} step={1} defaultValue={initial} required/></label>;
}

function Submit({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return <button type="submit" className={styles.operationButton} disabled={disabled}>{children}</button>;
}

export function ProductionManagedPayment({ operations, editable, priorReference, priorDate }: {
  operations: Operations; editable: boolean; priorReference?: string; priorDate?: string;
}) {
  const { data, saving, save, setNotice } = operations;
  const ready = useBrowserReady();
  const detail = data?.payment;
  if (!detail) return null;
  const payment = detail.payment;
  const precision = new Intl.NumberFormat('en', { style: 'currency', currency: payment.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** precision;
  const pending = payment.status === 'pending' && ['cod', 'manual'].includes(payment.provider);
  const showEvidence = payment.evidenceSubmitted;
  const amount = (form: FormData) => Math.round(numeric(form, 'amount') * scale);
  const display = (minor: number) => money(minor / scale, payment.currency);
  const transaction = detail.captureId || detail.transactionReference || priorReference || detail.providerId || detail.evidence?.reference;
  const moneyInput = (maximum: number) => <label>Verified amount ({payment.currency})
    <input name="amount" type="number" min={1 / scale} max={maximum / scale} step={1 / scale} required/>
  </label>;
  const paymentAction = (step: string, values: Record<string, unknown>, message: string) => void save({ action: 'payment-action', id: payment.id,
    step, values, keyed: step === 'refunds' }, message);
  const refunds = detail.refunds ?? [];
  const offline = ['cod', 'manual'].includes(payment.provider);
  const activeRefunds = refunds.filter(row => row.state === 'pending' || row.state === 'refunded');
  const inspected = data.shipments.filter(row => row.direction === 'return' && row.receivedAt && row.receiptLines?.length);
  const skuByLine = new Map(data.lines.map(line => [line.id, line.sku]));
  const labels = { pending: 'Awaiting confirmation', refunded: 'Confirmed', failed: 'Failed' } as Record<string, string>;

  return <section className={styles.payment} aria-label="Payment Info">
    <p className={styles.paymentHeading}>Payment Info:</p>
    <p>Payment Amount: {display(payment.amount)}</p>
    <p>Payment Date: {priorDate || 'N/A'}</p>
    <p>Transaction Id: {transaction || 'N/A'}</p>
    <p>Transaction Status: {payment.status}</p>
    {detail.evidence?.reference && <p>Receipt Reference: {detail.evidence.reference}</p>}
    {showEvidence && <a href={adminPath('/api/managed?' + new URLSearchParams({ receipt: payment.id, market: data.market }))}
      download>Download receipt</a>}
    {editable && ready && pending && <form method="post" className={styles.operationForm} onSubmit={submit((form, decision) => {
      const reason = value(form, 'reason');
      if (!reason || !decision) return;
      const input: Record<string, unknown> = { reason, decision };
      if (decision === 'approve' && payment.provider === 'manual') {
        if (!value(form, 'reference') || !value(form, 'amount')) return setNotice('Enter the verified receipt reference and amount.');
        input.verifiedReference = value(form, 'reference');
        input.verifiedAmount = amount(form);
      }
      paymentAction('review', input, decision === 'approve' ? 'Payment approved.' : 'Payment rejected.');
    })}>
      {payment.provider === 'manual' && <>
        <Field name="reference" label="Verified receipt reference" withReference required={false}/>
        <label>Verified amount ({payment.currency})<input name="amount" type="number" min="0" step={1 / scale}/></label>
      </>}
      <Field name="reason" label="Review note" maxLength={500}/>
      <div className={styles.operationButtons}>
        <button type="submit" className={styles.operationButton} value="approve" disabled={saving || payment.provider === 'manual' && !showEvidence}>Approve payment</button>
        <button type="submit" className={styles.operationButton} value="reject" disabled={saving}>Reject payment</button>
      </div>
    </form>}
    {editable && ready && detail.collection && <details>
      <summary>Record collection</summary>
      <form method="post" className={styles.operationForm} onSubmit={submit(form => {
        if (amount(form) !== detail.collection?.amount) return setNotice('Enter the exact balance due.');
        paymentAction('collect', { amount: amount(form), reference: value(form, 'reference') }, 'Collection recorded.');
      })}>
        <p>Balance due: {display(detail.collection.amount)}</p>
        {moneyInput(detail.collection.amount)}
        <Field name="reference" label="Verified collection reference" withReference/>
        <Submit disabled={saving}>Record collection</Submit>
      </form>
    </details>}
    {detail.refundBalance && <p>Refunded: {display(payment.refunded)} · On hold: {display(detail.refundBalance.held)} ·
      Available: {display(detail.refundBalance.available)}</p>}
    {detail.refundBalance?.awaitingProviderReference && <p role="status">Resume the saved refund before requesting another.</p>}
    {payment.reconciliation && <p role="status">Payment requires reconciliation.</p>}
    {editable && ready && detail.refund && !activeRefunds.some(row => row.returnShipment) && <details>
      <summary>{detail.refund.requiresReference ? 'Record refund' : 'Refund payment'}</summary>
      <form method="post" className={styles.operationForm} onSubmit={submit(form => paymentAction('refunds', {
        amount: amount(form), reason: value(form, 'reason'),
        ...(detail.refund?.requiresReference && { reference: value(form, 'reference') }),
      }, 'Refund recorded.'))}>
        <p>Available to refund: {display(detail.refund.amount)}</p>
        {moneyInput(detail.refund.amount)}
        <Field name="reason" label="Refund reason" maxLength={500}/>
        {detail.refund.requiresReference && <Field name="reference" label="Verified refund reference" withReference/>}
        <Submit disabled={saving}>{detail.refund.requiresReference ? 'Record refund' : 'Refund payment'}</Submit>
      </form>
    </details>}
    {editable && ready && detail.refund && !activeRefunds.some(row => !row.returnShipment) && inspected.map(receipt => {
      const remaining = (receipt.receiptLines ?? []).map(line => {
        const refunded = activeRefunds.filter(row => row.returnShipment === receipt._id)
          .flatMap(row => row.lines ?? []).filter(row => row.id === line.id).reduce((sum, row) => sum + row.quantity, 0);
        return { ...line, available: Math.min(100, line.sellable + line.damaged - refunded) };
      }).filter(line => line.available > 0);
      if (!remaining.length) return null;
      return <details key={receipt._id}>
        <summary>Refund inspected return {receipt._id.slice(-8)}</summary>
        <form method="post" className={styles.operationForm} onSubmit={submit(form => {
          const lines = remaining.map(line => ({ id: line.id, quantity: numeric(form, line.id) })).filter(line => line.quantity > 0);
          if (!lines.length) return setNotice('Select at least one inspected unit.');
          paymentAction('refunds', { returnShipment: receipt._id, lines, reason: value(form, 'reason'),
            ...(offline && { reference: value(form, 'reference') }) }, 'Refund recorded.');
        })}>
          <p>The original merchandise and discount determine the refund.</p>
          {remaining.map(line => <Quantity key={line.id} name={line.id} label={'Refund quantity for ' + (skuByLine.get(line.id) || 'order item')}
            max={line.available}/>)}
          <Field name="reason" label="Refund reason" maxLength={500}/>
          {offline && <Field name="reference" label="Verified refund reference" withReference/>}
          <Submit disabled={saving}>Refund selected units</Submit>
        </form>
      </details>;
    })}
    {refunds.length > 0 && <section aria-label="Refund history">
      <h3>Refund history</h3>
      <ul>{refunds.map(row => <li key={row.id}>
        <p>{display(row.amount)} · {labels[row.state] || row.state} · {row.providerId || row.reference || row.id}</p>
        {row.reconciliation && <p>Provider outcome requires review.</p>}
        {editable && ready && row.state === 'pending' && <form method="post" className={styles.operationForm} onSubmit={submit(form => {
          const ref = value(form, 'reference');
          void save({ action: 'refund-reconcile', id: payment.id, step: row.id,
            values: ref ? { reference: ref } : {} }, 'Refund reconciled.');
        })}>
          {!offline && !row.providerId && <Field name="reference" label="Provider refund reference (optional)" withReference required={false}/>}
          <Submit disabled={saving}>Resume saved refund</Submit>
        </form>}
      </li>)}</ul>
    </section>}
  </section>;
}

function ShipmentPlan({ data, operations }: { data: ManagedOrder; operations: Operations }) {
  const [warehouse, setWarehouse] = useState('');
  const origin = data.warehouses.find(location => location.id === warehouse)?.origin;
  const allocated = new Map<string, number>();
  for (const shipment of data.shipments) {
    if (shipment.direction === 'outbound' && shipment.state !== 'cancelled') {
      for (const line of shipment.lines) allocated.set(line.id, (allocated.get(line.id) ?? 0) + line.quantity);
    }
  }
  const lines = data.lines.map(line => ({ ...line, remaining: line.quantity - (allocated.get(line.id) ?? 0) }))
    .filter(line => line.remaining > 0);
  if (!data.warehouses.length || !lines.length) return null;
  return <form className={styles.operationForm} aria-label="Plan shipment" onSubmit={submit(form => {
    const selected = lines.map(line => ({ id: line.id, quantity: numeric(form, line.id),
      ...(origin === 'CN' && value(form, 'source-' + line.id) && { source: value(form, 'source-' + line.id) }),
      ...(origin === 'CN' && value(form, 'purchase-' + line.id) && { purchase: value(form, 'purchase-' + line.id) }),
    })).filter(line => line.quantity);
    if (!selected.length) return operations.setNotice('Select a quantity for at least one order line.');
    if (origin === 'CN' && selected.some(line => !line.source)) return operations.setNotice('Enter a verified dispatch source for each selected line.');
    void operations.save({ action: 'shipment-new', values: {
      warehouse, service: value(form, 'service'), lines: selected,
      parcels: [Object.fromEntries(['grams', 'length', 'width', 'height'].map(name => [name, numeric(form, name)]))],
    }, keyed: true }, 'Shipment planned.');
  })}>
    <label>Business location<select value={warehouse} onChange={event => setWarehouse(event.target.value)} required>
      <option value="">Select business location</option>
      {data.warehouses.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}
    </select></label>
    <label>Courier service<select name="service" key={warehouse} disabled={!origin} required>
      <option value="">Select courier service</option>
      {data.zones.filter(zone => zone.origin === origin).map(zone => <option key={zone.service} value={zone.service}>{zone.label || zone.service}</option>)}
    </select></label>
    <div className={styles.parcelFields}>
      {([['grams', 'Weight (g)', 100000], ['length', 'Length (cm)', 300], ['width', 'Width (cm)', 300], ['height', 'Height (cm)', 300]] as const)
        .map(([name, label, max]) => <Quantity key={name} name={name} label={label} min={1} max={max} initial=""/>)}
    </div>
    {lines.map(line => <fieldset key={line.id}>
      <legend>{line.sku}</legend>
      <p>{line.quantity} ordered · {line.remaining} available to allocate</p>
      <Quantity name={line.id} label={'Quantity to ship for ' + line.sku} max={Math.min(line.remaining, 100)}
        initial={lines.length === 1 ? Math.min(line.remaining, 100) : 0}/>
      {origin === 'CN' && <>
        <Field name={'source-' + line.id} label={'Dispatch source ID for ' + line.sku} maxLength={24} required={false}/>
        <Field name={'purchase-' + line.id} label={'Purchase ID for ' + line.sku} maxLength={24} required={false}/>
      </>}
    </fieldset>)}
    <Submit disabled={operations.saving}>Plan shipment</Submit>
  </form>;
}

type ReturnDisposition = { id: string; sellable: number; damaged: number; sellableBarcodes?: string[]; damagedBarcodes?: string[];
  lots?: { id: string; sellable: number; damaged: number }[] };

function reviewedDisposition(shipment: Shipment, form: FormData, reviews: Map<string, ReviewLine>): ReturnDisposition[] {
  return shipment.lines.map(line => {
    const review = reviews.get(line.id);
    if (review) {
      const lots = review.lots.map(lot => ({ id: lot.id, sellable: numeric(form, 'sellable-' + line.id + '-' + lot.id),
        damaged: numeric(form, 'damaged-' + line.id + '-' + lot.id),
      })).filter(lot => lot.sellable + lot.damaged > 0);
      return { id: line.id, lots, sellable: lots.reduce((sum, row) => sum + row.sellable, 0),
        damaged: lots.reduce((sum, row) => sum + row.damaged, 0) };
    }
    return { id: line.id, sellable: numeric(form, 'sellable-' + line.id), damaged: numeric(form, 'damaged-' + line.id),
      ...(line.tracked && { sellableBarcodes: scans(form, 'sellable-barcodes-' + line.id), damagedBarcodes: scans(form, 'damaged-barcodes-' + line.id) }) };
  });
}

function ReceiveForm({ shipment, operations }: { shipment: Shipment; operations: Operations }) {
  const reviews = new Map(shipment.lotReview?.map(row => [row.id, row]));
  return <form className={styles.operationForm} aria-label="Receive return" onSubmit={submit(form => {
    const lines = reviewedDisposition(shipment, form, reviews);
    if (lines.some((line, index) => line.sellable + line.damaged !== shipment.lines[index].quantity)) {
      return operations.setNotice('Classify the full quantity for each returned line.');
    }
    const barcodes = lines.flatMap(line => [...(line.sellableBarcodes ?? []), ...(line.damagedBarcodes ?? [])]);
    if (new Set(barcodes).size !== barcodes.length || lines.some((line, index) => shipment.lines[index].tracked &&
      (line.sellableBarcodes?.length !== line.sellable || line.damagedBarcodes?.length !== line.damaged))) {
      return operations.setNotice('Scan each tracked unit once in the matching disposition.');
    }
    void operations.save({ action: 'shipment-action', id: shipment._id, step: 'receive', values: {
      evidence: value(form, 'evidence'), lines, ...(reviews.size && { lotEvidence: value(form, 'lotEvidence') }),
    } }, 'Return received.');
  })}>
    <Field name="evidence" label="Verified warehouse receipt reference" withReference/>
    {!!reviews.size && <label>Reason<textarea name="lotEvidence" maxLength={500} placeholder="Reason for this adjustment" required/></label>}
    {shipment.lines.map(line => <fieldset key={line.id}>
      <legend>{line.sku} ({line.quantity} returned)</legend>
      {reviews.has(line.id) ? reviews.get(line.id)?.lots.map(lot => <fieldset key={lot.id}>
        <legend>{lot.lotNumber} ({lot.available} available)</legend>
        <Quantity name={'sellable-' + line.id + '-' + lot.id} label={'Sellable quantity for ' + lot.lotNumber} max={Math.min(line.quantity, lot.sellableAvailable)}/>
        <Quantity name={'damaged-' + line.id + '-' + lot.id} label={'Damaged quantity for ' + lot.lotNumber} max={Math.min(line.quantity, lot.available)}/>
      </fieldset>) : <>
        <Quantity name={'sellable-' + line.id} label="Sellable quantity" max={line.quantity}/>
        <Quantity name={'damaged-' + line.id} label="Damaged quantity" max={line.quantity}/>
        {line.tracked && <>
          <label>Sellable unit barcodes<textarea name={'sellable-barcodes-' + line.id} maxLength={26000}/></label>
          <label>Damaged unit barcodes<textarea name={'damaged-barcodes-' + line.id} maxLength={26000}/></label>
        </>}
      </>}
    </fieldset>)}
    <Submit disabled={operations.saving}>Receive return</Submit>
  </form>;
}

const waitingReturn = ['dispatched', 'in-transit', 'out-for-delivery', 'delivered', 'returned'];
const activeTracking = ['dispatched', 'in-transit', 'customs', 'out-for-delivery', 'exception'];
function ShipmentActions({ shipment, operations, canReturn }: { shipment: Shipment; operations: Operations; canReturn: boolean }) {
  const { saving, data, save, setNotice } = operations;
  const { state, direction, provider, tracking, _id: id } = shipment;
  const action = (step: string, values: Record<string, unknown>, message: string) => void save({ action: 'shipment-action', id,
    step, values, keyed: step === 'return' }, message);
  if (direction === 'return') return canReturn && !shipment.receivedAt && tracking && waitingReturn.includes(state)
    ? <ReceiveForm shipment={shipment} operations={operations}/> : null;
  if (state === 'planned') return <form className={styles.operationForm} onSubmit={submit(form => {
    const barcodes = scans(form, 'barcodes');
    if (new Set(barcodes).size !== barcodes.length || barcodes.length > 200) return setNotice('Enter each scanned barcode once.');
    action('pick', barcodes.length ? { barcodes } : {}, 'Shipment picked.');
  })}>
    <label>Unit barcodes (for tracked stock)<textarea name="barcodes" maxLength={26000}/></label>
    <Submit disabled={saving}>Confirm pick</Submit>
    <button type="button" className={styles.operationButton} disabled={saving} onClick={() => action('cancel', {}, 'Shipment cancelled.')}>Cancel allocation</button>
  </form>;
  if (state === 'picked') return <button type="button" className={styles.operationButton} disabled={saving}
    onClick={() => action('pack', {}, 'Shipment packed.')}>Mark packed</button>;
  const returnable = shipment.returnableLines ?? [];
  const returnOpen = canReturn && returnable.length > 0 && data?.status !== 'RETURNED' && (state === 'exception' ||
    state === 'delivered' && ['PENDING_RETURN', 'RETURN_REQUESTED', 'PARTIAL'].includes(data?.status ?? ''));
  return <>
    {state === 'packed' && <>
      {provider === 'steadfast' && <button type="button" className={styles.operationButton} disabled={saving}
        onClick={() => action('dispatch', {}, 'Shipment sent to courier.')}>Send to Courier</button>}
      <details><summary>Record courier handoff</summary>
        <form className={styles.operationForm} onSubmit={submit(form => action('dispatch', {
          tracking: value(form, 'tracking'), evidence: value(form, 'evidence'),
          ...(value(form, 'carrierId') && { carrierId: value(form, 'carrierId') }),
        }, 'Courier handoff recorded.'))}>
          <Field name="tracking" label="Tracking number" withReference/>
          <Field name="carrierId" label="Courier reference" withReference required={false}/>
          <Field name="evidence" label="Verified handoff reference" withReference/>
          <Submit disabled={saving}>Record courier handoff</Submit>
        </form>
      </details>
    </>}
    {tracking && activeTracking.includes(state) && <>
      {provider === 'steadfast' && <button type="button" className={styles.operationButton} disabled={saving}
        onClick={() => action('sync', {}, 'Courier status updated.')}>Sync with Courier</button>}
      <details><summary>Record tracking event</summary>
        <form className={styles.operationForm} onSubmit={submit(form => {
          const at = new Date(value(form, 'at'));
          if (!Number.isFinite(at.getTime())) return setNotice('Enter the courier observation time.');
          action('tracking', { id: value(form, 'id'), at: at.toISOString(), code: value(form, 'code'),
            evidence: value(form, 'evidence') }, 'Tracking event recorded.');
        })}>
          <Field name="id" label="Courier event ID" withReference/>
          <label>Observed at<input type="datetime-local" name="at" required/></label>
          <Field name="code" label="Courier status" withReference/>
          <Field name="evidence" label="Verified tracking reference" withReference/>
          <Submit disabled={saving}>Record tracking event</Submit>
        </form>
      </details>
    </>}
    {returnOpen && <form className={styles.operationForm} aria-label="Record return shipment" onSubmit={submit(form => {
      const lines = returnable.map(line => ({ id: line.id, quantity: numeric(form, line.id) })).filter(line => line.quantity);
      if (!lines.length) return setNotice('Select at least one return quantity.');
      action('return', { lines, tracking: value(form, 'tracking'), evidence: value(form, 'evidence') }, 'Return shipment recorded.');
    })}>
      <Field name="tracking" label="Return tracking number" withReference/>
      <Field name="evidence" label="Verified return handoff reference" withReference/>
      {returnable.map(line => <Quantity key={line.id} name={line.id} label={'Return quantity for ' + line.sku} max={line.quantity}/>)}
      <Submit disabled={saving}>Record return shipment</Submit>
    </form>}
  </>;
}

export function ProductionManagedShipments({ orderId, operations, editable, canReturn }: {
  orderId: string; operations: Operations; editable: boolean; canReturn: boolean;
}) {
  const { data, saving, save, loadingError } = operations;
  const activeReturn = ['IN_REVIEW', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'DELIVERED', 'RETURN_REQUESTED'].includes(data?.status ?? '');
  return <details className={styles.card}>
    <summary className={styles.cardHeading}>Shipment</summary>
    <div className={styles.shipmentOperations}>
      {loadingError && <p role="alert">{loadingError}</p>}
      {!data && !loadingError && <p role="status">Loading shipment…</p>}
      {editable && canReturn && activeReturn && !!data?.shipments.length && <button type="button" className={styles.operationButton} disabled={saving}
        onClick={() => void save({ action: 'shipment-return-request', values: {} }, 'Order marked as pending return.')}>Mark as Pending Return</button>}
      {data?.shipments.map(shipment => {
        const title = (shipment.direction === 'return' ? 'Return parcel ' : 'Shipment ') + shipment._id.slice(-8);
        const warehouse = data.warehouses.find(location => location.id === shipment.warehouse)?.label || shipment.warehouse;
        const history = '/desk/shipping/shipment-desk?' + new URLSearchParams({
          region: data.market === 'BD' ? 'BD' : 'INTERNATIONAL', market: data.market, order: orderId, record: shipment._id,
        });
        return <section className={styles.shipmentRecord} key={shipment._id} aria-label={title}>
          <h3>{title}</h3>
          <dl className={styles.shipmentFacts}>
            <div><dt>State</dt><dd>{shipment.state}</dd></div>
            <div><dt>Fulfillment site</dt><dd>{warehouse || 'Unrecorded'}{shipment.origin ? ' · ' + shipment.origin : ''}</dd></div>
            <div><dt>Service</dt><dd>{[shipment.service, shipment.provider].filter(Boolean).join(' · ') || 'Unrecorded'}</dd></div>
            <div><dt>Tracking number</dt><dd>{shipment.tracking || 'Unrecorded'}</dd></div>
          </dl>
          {(shipment.parcels?.length ?? 0) > 0 && <ul className={styles.shipmentLines} aria-label="Parcel dimensions">
            {shipment.parcels?.map((parcel, index) => <li key={index}>
              Package {index + 1} · {parcel.grams} g · {parcel.length} × {parcel.width} × {parcel.height} cm
            </li>)}
          </ul>}
          <ul className={styles.shipmentLines} aria-label="Allocated lines">
            {shipment.lines.map(line => <li key={line.id}>
              {line.sku || line.id} · {line.quantity} units
              {!!line.barcodes?.length && ' · ' + line.barcodes.length + ' tracked'}
            </li>)}
          </ul>
          {shipment.receiptLines?.map(line => <p key={line.id}>{shipment.lines.find(item => item.id === line.id)?.sku}: {line.sellable} sellable, {line.damaged} damaged</p>)}
          <Link className={styles.operationButton} href={history}>View shipment history</Link>
          {editable && <ShipmentActions shipment={shipment} operations={operations} canReturn={canReturn}/>}
        </section>;
      })}
      {data && editable && <ShipmentPlan key={data.status} data={data} operations={operations}/>}
      {data && !data.shipments.length && (!editable || !data.warehouses.length) && <p>No shipment has been recorded.</p>}
    </div>
  </details>;
}
