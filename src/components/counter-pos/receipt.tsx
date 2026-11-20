'use client';

import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { counterDate, counterMoney, counterScopeFields, type CounterReceipt, type CounterReturns, type CounterShift, type CounterShifts } from '@/lib/counter-pos-contract';
import { counterApiUrl, counterError, counterRead, CounterRequestError, counterWrite } from './client';
import styles from './cashier.module.css';

const labels = { AUTHORIZED: 'Authorized', INSPECTED: 'Inspected', REFUNDED: 'Refunded', CANCELLED: 'Cancelled',
  COMPLETED_NO_REFUND: 'Completed without refund' };
type ReturnAction = 'authorize' | 'receive' | 'refund' | 'cancel';

function ReturnForm({ action, label, shiftId, returnId, children, saving, submit }: {
  action: ReturnAction; label: string; shiftId?: string; returnId?: string; children?: ReactNode; saving: boolean;
  submit: (action: ReturnAction, fields: FormData, returnId?: string, shiftId?: string) => void;
}) {
  return <form method="post" className={styles.returnForm} onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); submit(action, new FormData(event.currentTarget), returnId, shiftId);
  }}>
    {children}<label>Reason<input name="reason" required maxLength={180}/></label>
    <button type="submit" className="button secondary" disabled={saving}>{label}</button>
  </form>;
}

function amounts(data: FormData, name: string, id: string) {
  const value = String(data.get(name + ':' + id) || '0');
  return /^\d{1,4}$/.test(value) ? Number(value) : NaN;
}

export function SaleReturns({ receipt, canWrite }: { receipt: CounterReceipt; canWrite: boolean }) {
  const [data, setData] = useState<CounterReturns>();
  const [activeShift, setActiveShift] = useState<CounterShift>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [unknown, setUnknown] = useState(false);
  const command = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void counterRead<CounterReturns>('counter-returns', receipt.context, { id: receipt.id }, controller.signal)
      .then(setData).catch(error => { if (!controller.signal.aborted) setMessage(counterError(error)); });
    if (receipt.context.registerLabel && canWrite) {
      void counterRead<CounterShifts>('counter-shifts', receipt.context, undefined, controller.signal)
        .then(value => setActiveShift(value.active ?? undefined)).catch(() => {});
    }
    return () => controller.abort();
  }, [receipt, canWrite]);

  async function submit(action: ReturnAction, fields: FormData, returnId?: string, shiftId?: string) {
    if (!canWrite || !data || command.current) return;
    const reason = String(fields.get('reason') || '').trim();
    let lines: Record<string, unknown>[] | undefined;
    if (action === 'authorize') {
      lines = data.lines.map(({ variantId }) => ({ variantId, quantity: amounts(fields, 'quantity', variantId) })).filter(row => row.quantity !== 0);
    } else if (action === 'receive') {
      const current = data.returns.find(row => row.id === returnId);
      lines = current?.lines.map(({ variantId }) => ({ variantId, sellable: amounts(fields, 'sellable', variantId),
        damaged: amounts(fields, 'damaged', variantId) }));
    }
    if (lines && (!lines.length || lines.some(row => Object.values(row).some(value => typeof value === 'number' && Number.isNaN(value))))) {
      setMessage('Enter the quantities you received for the selected item lines.');
      return;
    }
    const values = { ...counterScopeFields(receipt.context), saleId: receipt.id, action, reason, ...(lines && { lines }),
      ...(returnId && { returnId }), ...(shiftId && { shiftId }) };
    const fingerprint = JSON.stringify(values);
    if (unknown && operation.current?.fingerprint !== fingerprint) {
      setMessage('Retry the same return action and details to check the interrupted request.');
      return;
    }
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    command.current = true;
    setBusy(true);
    setMessage('');
    try {
      setData(await counterWrite<CounterReturns>('counter-return', { ...values, operationId: operation.current.id }));
      operation.current = undefined;
      setUnknown(false);
    } catch (error) {
      setUnknown(!(error instanceof CounterRequestError) || error.status >= 500);
      setMessage(counterError(error));
    } finally { command.current = false; setBusy(false); }
  }

  const money = (minor: number) => counterMoney(minor, receipt.totals.currency);
  return <section className={styles.afterSales} aria-label="Returns for this sale">
    <h2>Returns and cash refunds</h2>
    {message && <p className="notice warn" role="alert">{message}</p>}
    {!data ? !message && <p role="status">Loading sale return records…</p> : <>
      {data.returns.length === 0 && <p className={styles.muted}>No return records for this sale.</p>}
      {canWrite && data.lines.some(line => line.available > 0) && <details className={styles.returnItem}><summary>Authorize a return</summary>
        <ReturnForm action="authorize" label="Authorize return" saving={busy} submit={submit}>
          {data.lines.filter(line => line.available > 0).map(line => <label key={line.variantId}>{line.name} · {line.sku}
            {' (' + line.available + ' eligible)'}<input type="number" min="0" max={line.available} step="1" defaultValue="0"
              name={'quantity:' + line.variantId}/></label>)}
        </ReturnForm>
      </details>}
      {data.returns.map(row => <article className={styles.returnItem} key={row.id}>
        <h3>{labels[row.status]}</h3><p>Refund amount {money(row.refundMinor)}</p><p className={styles.muted}>{row.id}</p>
        <ul>{row.lines.map(line => <li key={line.variantId}>{data.lines.find(item => item.variantId === line.variantId)?.sku ?? line.variantId}
          {' · ' + line.quantity + ' units'}{line.sellable !== undefined && ' · ' + line.sellable + ' sellable, ' + (line.damaged ?? 0) + ' damaged'}</li>)}</ul>
        {canWrite && row.status === 'AUTHORIZED' && <div className={styles.returnActions}>
          <details><summary>Receive and inspect</summary>
            <ReturnForm action="receive" label="Record inspection" saving={busy} returnId={row.id} submit={submit}>
              {row.lines.map(line => <fieldset key={line.variantId}><legend>{data.lines.find(item => item.variantId === line.variantId)?.sku ?? 'Item'}
                {' · ' + line.quantity + ' units'}</legend>
                <label>Sellable units<input type="number" min="0" max={line.quantity} defaultValue={0} name={'sellable:' + line.variantId}/></label>
                <label>Damaged units<input type="number" min="0" max={line.quantity} defaultValue={0} name={'damaged:' + line.variantId}/></label>
              </fieldset>)}
            </ReturnForm>
          </details>
          <details><summary>Cancel authorization</summary>
            <ReturnForm action="cancel" label="Cancel authorization" saving={busy} returnId={row.id} submit={submit}/>
          </details>
        </div>}
        {data.canRefund && canWrite && row.status === 'INSPECTED' && <details>
          <summary>Record cash reimbursement</summary>
          {receipt.context.shiftRequired && !activeShift ? <p>Open this register before reimbursing cash.</p>
            : <ReturnForm action="refund" label="Record cash reimbursement" saving={busy} returnId={row.id}
              shiftId={activeShift?.id} submit={submit}/>}
        </details>}
      </article>)}
    </>}
  </section>;
}

export function CounterReceiptScreen({ receipt, historyPath, canReturn }: {
  receipt: CounterReceipt; historyPath: string; canReturn: boolean;
}) {
  const context = receipt.context;
  const { totals, tender } = receipt;
  const money = (minor: number) => counterMoney(minor, totals.currency);
  const rows = [['Subtotal', totals.subtotalMinor], ['Discount', totals.discountMinor], ['Tax', totals.taxMinor], ['Total', totals.totalMinor],
    ['Cash received', tender.receivedMinor], ['Cash applied', tender.appliedMinor], ['Change', tender.changeMinor]] as const;
  const history = new URLSearchParams(counterScopeFields(context));
  if (context.market === 'US') history.set('region', 'INTERNATIONAL');
  return <div className={styles.root}>
    <header className={styles.header}><div><h1>Sale receipt</h1><p>{receipt.invoice}</p></div>
      <div className={styles.actions}>
        <Link href={historyPath + '?' + history} className="button secondary">Sale history</Link>
        <a href={counterApiUrl('counter-receipt-download', context, { id: receipt.id })} className="button secondary" download>
          <Download size={16} aria-hidden="true"/> Download receipt</a>
        <button type="button" className="button primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true"/> Print receipt</button>
      </div>
    </header>
    <article className={styles.printable} aria-label="Saved receipt">
      <header><h2>{context.businessName}</h2><p>{context.outletName} · {context.market} {context.currency}</p>
        <p>{receipt.invoice} · {counterDate(receipt.at, context.market)}</p>
        <p>Operator {context.operatorName}{context.registerLabel ? ' · ' + context.registerLabel : ''}</p>
        {receipt.customer && <p>Customer {receipt.customer.name}</p>}</header>
      <table><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
        <tbody>{receipt.lines.map(line => <tr key={line.variantId}><td>{line.name}<small>{line.sku}</small></td>
          <td>{line.quantity}</td><td>{money(line.totalMinor)}</td></tr>)}</tbody></table>
      <dl className={styles.totals}>{rows.map(([label, amount]) => <div key={label}>
        <dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
    </article>
    <SaleReturns receipt={receipt} canWrite={canReturn}/>
  </div>;
}
