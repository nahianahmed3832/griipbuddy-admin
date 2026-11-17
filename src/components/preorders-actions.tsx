'use client';

import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import { preOrderRequest, preOrderStatuses, preOrdersPath, statusText, type PreOrderRow } from '@/lib/preorders';

export const fieldText = (data: FormData, key: string) => (data.get(key) as string | null)?.trim() || undefined;
export const fieldNumber = (data: FormData, key: string) => {
  const value = fieldText(data, key);
  return value ? Number(value) : undefined;
};
const subscribe = () => () => undefined;
const readyOnClient = () => true;
const loadingOnServer = () => false;
export const usePreOrderInteractive = () => useSyncExternalStore(subscribe, readyOnClient, loadingOnServer);
export const preOrderReceiptTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export type PreOrderReceipt = { name: string; size: number; data: string; image: boolean };
export async function encodePreOrderReceipts(selection: FormDataEntryValue[], current: PreOrderReceipt[] = []) {
  const files = selection.filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) throw new Error('Choose at least one receipt.');
  if (current.length + files.length > 8) throw new Error('Choose up to eight receipts.');
  if ([...current, ...files].reduce((total, file) => total + file.size, 0) > 6_000_000) throw new Error('Choose up to 6 MB of receipts.');
  if (files.some(file => !preOrderReceiptTypes.includes(file.type))) throw new Error('Choose PNG, JPEG, WebP, or PDF receipts.');
  return Promise.all(files.map(async file => ({
    name: file.name, size: file.size, data: await readDataUrl(file), image: file.type !== 'application/pdf',
  })));
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the attachment.'));
    reader.onerror = () => reject(new Error('Could not read the attachment.'));
    reader.readAsDataURL(file);
  });
}

export async function encodePreOrderImage(file: unknown) {
  if (!(file instanceof File) || !file.size || file.size > 1_500_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image up to 1.5 MB.');
  }
  return (await readDataUrl(file)).split(',')[1];
}

export function Amount({ label, name, initial, required, autoFocus }: { label: string; name: string; initial?: number; required?: boolean; autoFocus?: boolean }) {
  return <label>{label}<input type="number" name={name} defaultValue={initial} required={required} min="0" max="10000000" step="0.01" autoFocus={autoFocus} /></label>;
}

export function StatusSelect({ label = 'Status', initial, required = true }: { label?: string; initial?: string; required?: boolean }) {
  return <label>{label}<select name="status" defaultValue={initial ?? ''} required={required}>
    <option value="">{required ? 'Choose status' : 'Default status'}</option>
    {preOrderStatuses.map(status => <option value={status} key={status}>{statusText(status)}</option>)}
  </select></label>;
}

function Confirm({ children }: { children: ReactNode }) {
  return <label><input type="checkbox" required /> {children}</label>;
}

export function PreOrderAction({ label, action, id, build, children, button = label, after, closed }: {
  label: string;
  action: string;
  id?: string;
  build: (data: FormData) => object | Promise<object>;
  children: ReactNode;
  button?: string;
  after?: (result: unknown) => string | void;
  closed?: boolean;
}) {
  const router = useRouter();
  const ready = usePreOrderInteractive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    const form = event.currentTarget;
    try {
      const result = await preOrderRequest(action, { id }, await build(new FormData(form)));
      form.reset();
      const feedback = after?.(result);
      setSuccess(feedback ?? 'Saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this action.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <details className="panel padded" open={closed ? undefined : true}>
    <summary>{label}</summary>
    <form className="operation-form" onSubmit={submit}>
      <div className="filters">{children}</div>
      <button className="button secondary" disabled={busy || !ready}>{busy ? 'Working…' : button}</button>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  </details>;
}

export function PreOrderDetailActions({ row, edit, remove }: { row: PreOrderRow; edit: boolean; remove: boolean }) {
  const router = useRouter();
  const id = row._id;
  return <section className="panel padded stack" aria-label="Pre-order actions">
    <h2>Pre-order actions</h2>
    {edit && <>
      <PreOrderAction label="Quote" action="quote" id={id} closed button="Save quote" build={data => {
        const price = fieldNumber(data, 'price');
        const total = fieldNumber(data, 'total');
        const retainTotal = price === row.quoted_unit_price || total !== row.quoted_total;
        return {
          quoted_unit_price: price, quoted_total: retainTotal ? total : undefined,
          advance_amount: fieldNumber(data, 'advance') ?? 0, delivery_charge: fieldNumber(data, 'delivery'), send_sms: data.has('sms'),
        };
      }}>
        <Amount label="Quoted unit price" name="price" initial={row.quoted_unit_price} required />
        <Amount label="Quoted product total" name="total" initial={row.quoted_total} />
        <Amount label="Advance required" name="advance" initial={row.advance_amount} />
        <Amount label="Delivery charge" name="delivery" initial={row.delivery_charge} />
        <label><input name="sms" type="checkbox" /> Send quote SMS to the customer</label>
      </PreOrderAction>
      {!row.advance_paid && <PreOrderAction label="Record advance" action="advance" id={id} closed button="Save advance" build={data => ({
        paid_amount: fieldNumber(data, 'amount'), method: fieldText(data, 'method'),
        sender_number: fieldText(data, 'sender'), trxId: fieldText(data, 'transaction'),
      })}>
        <Amount label="Amount received" name="amount" initial={row.advance_amount} required />
        <label>Payment method<input name="method" maxLength={60} /></label>
        <label>Sender number<input name="sender" type="tel" maxLength={20} /></label>
        <label>Transaction ID<input name="transaction" maxLength={80} /></label>
        <Confirm>I verified this payment.</Confirm>
      </PreOrderAction>}
      <PreOrderAction label="Attach payment receipt" action="receipt" id={id} closed button="Upload receipt" build={async data => ({
        files: (await encodePreOrderReceipts(data.getAll('image'))).map(file => file.data.split(',')[1]),
        amount: fieldNumber(data, 'amount'), method: fieldText(data, 'method'), note: fieldText(data, 'note'),
      })}>
        <label>Receipt files<input type="file" name="image" accept={preOrderReceiptTypes.join(',')} multiple required /></label>
        <Amount label="Receipt amount" name="amount" />
        <label>Receipt payment method<input name="method" maxLength={64} /></label>
        <label>Receipt note<input name="note" maxLength={500} /></label>
      </PreOrderAction>
      <PreOrderAction label="Update status" action="status" id={id} closed button="Save status" build={data => ({
        status: fieldText(data, 'status'), tracking_code: fieldText(data, 'tracking'), consignment_id: fieldNumber(data, 'consignment'),
        courier_note: fieldText(data, 'note'), estimated_delivery_time: fieldText(data, 'estimate'),
      })}>
        <StatusSelect label="New status" initial={row.status} />
        <label>Tracking code<input name="tracking" defaultValue={row.tracking_code} maxLength={120} /></label>
        <label>Consignment ID<input name="consignment" type="number" min="1" step="1" defaultValue={row.consignment_id || undefined} /></label>
        <label>Courier note<input name="note" defaultValue={row.courier_note} maxLength={500} /></label>
        <label>Estimated delivery<input name="estimate" defaultValue={row.estimated_delivery_time} maxLength={120} /></label>
      </PreOrderAction>
      {!row.transfer_to_courier && !row.consignment_id && <PreOrderAction label="Send to courier" action="dispatch" id={id} closed button="Dispatch pre-order" build={() => ({})}>
        <Confirm>I verified the address and cash to collect.</Confirm>
      </PreOrderAction>}
      {row.customer_phone && <PreOrderAction label="Send SMS" action="sms" id={id} closed button="Send message" build={data => ({ message: fieldText(data, 'message') })}>
        <label>SMS message<textarea name="message" maxLength={600} required /></label>
        <Confirm>Send this message to {row.customer_phone}.</Confirm>
      </PreOrderAction>}
      <PreOrderAction label="Mark as called" action="called" id={id} closed button="Record call" build={() => ({})}>
        <Confirm>I contacted the customer.</Confirm>
      </PreOrderAction>
      <PreOrderAction label="Add staff note" action="note" id={id} closed button="Save staff note" build={data => ({ note: fieldText(data, 'note') })}>
        <label>Staff note<textarea name="note" maxLength={500} required /></label>
      </PreOrderAction>
    </>}
    {remove && <PreOrderAction label="Delete pre-order" action="remove" id={id} closed button="Delete permanently" build={() => ({})}
      after={() => { router.push(adminPath(preOrdersPath)); }}>
      <Confirm>Permanently delete this pre-order.</Confirm>
    </PreOrderAction>}
  </section>;
}

export function PreOrderBulkActions({ ids, batches }: { ids: string[]; batches: string[] }) {
  return <div className="padded stack">
    <p aria-live="polite">{ids.length} selected</p>
    <PreOrderAction label="Change selected statuses" action="bulk-status" closed button="Apply status" build={data => ({ ids, status: fieldText(data, 'status') })}
      after={result => {
        return `${(result as { modified?: number }).modified ?? 0} statuses updated.`;
      }}>
      <StatusSelect label="New status" />
    </PreOrderAction>
    <PreOrderAction label="Assign selected to batch" action="bulk-batch" closed button="Assign batch" build={data => ({ ids, batch: fieldText(data, 'batch') })}
      after={result => {
        return `${(result as { modified?: number }).modified ?? 0} pre-orders assigned.`;
      }}>
      <label>Batch label<input name="batch" maxLength={120} list="pre-order-batches" required /></label>
      <datalist id="pre-order-batches">{batches.map(batch => <option key={batch} value={batch} />)}</datalist>
    </PreOrderAction>
    <PreOrderAction label="Send selected to courier" action="bulk-dispatch" closed button="Dispatch selected" build={() => ({ ids })} after={result => {
      const rows = result as { success?: boolean }[];
      const done = rows.filter(row => row.success).length;
      return `${done} dispatched. ${rows.length - done} could not be dispatched. Review each pre-order before retrying.`;
    }}>
      <Confirm>I verified the addresses and cash to collect for the selected pre-orders.</Confirm>
    </PreOrderAction>
  </div>;
}
