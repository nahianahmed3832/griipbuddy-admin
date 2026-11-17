'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { preOrderItems, preOrderNumber, preOrderRequest, type PreOrderRow } from '@/lib/preorders';
import { Amount, encodePreOrderImage, fieldNumber, fieldText, StatusSelect } from './preorders-actions';
import styles from './preorders.module.css';

const actions = {
  quote: ['Quote Pre-Order', 'Save Quote'], advance: ['Record Advance Payment', 'Confirm Advance'],
  status: ['Update Status', 'Update Status'], 'bulk-status': ['Update Status', 'Update Status'],
  'bulk-batch': ['Assign to Batch', 'Assign Batch'], dispatch: ['Send to courier?', 'Confirm'],
  'bulk-dispatch': ['Send to courier?', 'Confirm'], sms: ['Send SMS', 'Send SMS'], remove: ['Delete pre-order?', 'Delete'],
  receipt: ['Upload Payment Receipt', 'Save Receipt'], history: ['Call History', 'Close'],
} as const;
export type ProductionPreOrderAction = keyof typeof actions;

type ActionProps = { kind: ProductionPreOrderAction; row?: PreOrderRow; ids?: string[]; batches: string[];
  close: () => void; saved: (message: string) => void };

export function ProductionPreOrderActionDialog({ kind, row, ids = [], batches, close, saved }: ActionProps) {
  const router = useRouter();
  const modal = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const batchId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [initialTitle, button] = actions[kind];
  const title = kind === 'bulk-dispatch' ? `Send ${ids.length} pre-orders to courier?` : initialTitle;
  const quantity = row?.quantity ?? (row ? preOrderItems(row).reduce((sum, item) => sum + (item.quantity ?? 1), 0) : 0);
  useEffect(() => { modal.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      let body: Record<string, unknown> = {};
      if (kind === 'quote') body = { quoted_unit_price: fieldNumber(data, 'price'),
        advance_amount: fieldNumber(data, 'advance') ?? 0, delivery_charge: fieldNumber(data, 'delivery'), send_sms: data.has('sms') };
      if (kind === 'advance') {
        const proof = data.getAll('proof').filter(value => value instanceof File && value.size);
        const files: string[] = [];
        if (proof.length > 6) throw new Error('Choose up to six payment proof images.');
        for (const file of proof) {
          const image = await encodePreOrderImage(file);
          files.push((await preOrderRequest<{ key: string }>('reference-edit', {}, { image })).key);
        }
        body = { paid_amount: fieldNumber(data, 'amount'), method: fieldText(data, 'method'),
          sender_number: fieldText(data, 'sender'), trxId: fieldText(data, 'transaction'), ...(files.length && { files }) };
      }
      if (kind === 'status' || kind === 'bulk-status') body = { status: fieldText(data, 'status'), ...(kind === 'bulk-status' && { ids }) };
      if (kind === 'bulk-batch') body = { ids, batch: fieldText(data, 'batch') };
      if (kind === 'bulk-dispatch') body = { ids };
      if (kind === 'sms') body = { message: fieldText(data, 'message') };
      if (kind === 'receipt') body = { image: await encodePreOrderImage(data.get('image')), amount: fieldNumber(data, 'amount'),
        method: fieldText(data, 'method'), note: fieldText(data, 'note') };
      const result = await preOrderRequest<unknown>(kind, { id: row?._id }, body);
      const message = kind === 'bulk-dispatch' && Array.isArray(result)
        ? `Sent ${result.filter(value => value?.success === true).length}/${ids.length} to courier` : 'Saved.';
      saved(message);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this action.');
    } finally {
      setBusy(false);
    }
  }
  return <dialog ref={modal} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <div className={styles.splitHeading}><h2 id={titleId}>{title}</h2><button type="button" className={styles.iconButton} aria-label="Close dialog" disabled={busy} onClick={close}><X size={16}/></button></div>
    {kind === 'history' ? <div className={styles.dialogFields}>
      {[...(row?.call_logs ?? [])].reverse().map((call, index) => <article className={styles.callEntry} key={call._id ?? index}>
        <strong>{call.called_by?.full_name || call.called_by_name || 'N/A'}</strong>
        {call.called_at && <p className={styles.muted}>{new Date(call.called_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</p>}
      </article>)}
      <button type="button" className={styles.control} onClick={close}>Close</button>
    </div> : <form className={styles.dialogFields} onSubmit={submit}>
      {kind === 'quote' && <>
        <Amount label="Unit Price (BDT)" name="price" initial={row?.quoted_unit_price} required/>
        <Amount label="Required Advance" name="advance" initial={row?.advance_amount}/>
        <Amount label="Delivery Charge" name="delivery" initial={row?.delivery_charge}/>
        <p className={styles.muted}>Quantity: {quantity}</p>
        <label className={styles.checkLabel}><input type="checkbox" name="sms"/> Send quote SMS to customer</label>
      </>}
      {kind === 'advance' && <>
        <Amount label="Amount Received (BDT)" name="amount" initial={row?.advance_amount} required/>
        <label>Method<input name="method" placeholder="bKash / Nagad / Cash" maxLength={60}/></label>
        <label>Sender Number<input name="sender" type="tel" maxLength={20}/></label>
        <label>Transaction ID<input name="transaction" placeholder="TrxID (optional)" maxLength={80}/></label>
        <label>Payment Proof (optional)<input name="proof" type="file" accept="image/png,image/jpeg,image/webp" multiple/></label>
      </>}
      {(kind === 'status' || kind === 'bulk-status') && <StatusSelect label="Select Status" initial={row?.status}/>}
      {kind === 'bulk-batch' && <>
        <label>Batch Label<input name="batch" list={batchId} defaultValue={row?.batch} maxLength={120} required/></label>
        <datalist id={batchId}>{batches.map(batch => <option key={batch} value={batch}/>)}</datalist>
        <p className={styles.muted}>Applying to {ids.length} pre-order{ids.length === 1 ? '' : 's'}</p>
      </>}
      {kind === 'dispatch' && <p>This creates a Steadfast consignment for <strong>{row && preOrderNumber(row)}</strong> and marks it handed over to courier.</p>}
      {kind === 'bulk-dispatch' && <p>A Steadfast consignment will be created for each selected pre-order.</p>}
      {kind === 'sms' && <label>Message to {row?.customer_phone}<textarea name="message" maxLength={600} required rows={4}/></label>}
      {kind === 'remove' && <p>This permanently deletes <strong>{row && preOrderNumber(row)}</strong>. This cannot be undone.</p>}
      {kind === 'receipt' && <>
        <label>Upload payment proof<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required/></label>
        <Amount label="Amount (optional)" name="amount"/>
        <label>Method (optional)<input name="method" placeholder="bKash / Nagad / Cash" maxLength={64}/></label>
        <label>Note (optional)<textarea name="note" maxLength={500}/></label>
      </>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.dialogButtons}>
        <button type="button" className={styles.control} disabled={busy} onClick={close}>{kind === 'remove' || kind.includes('dispatch') ? 'Cancel' : 'Close'}</button>
        <button className={kind === 'remove' ? styles.danger : styles.primary} disabled={busy}>{busy ? 'Saving...' : button}</button>
      </div>
    </form>}
  </dialog>;
}
