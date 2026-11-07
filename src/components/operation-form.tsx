'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Field, OperationId } from '@/lib/operations';
import type { Region } from '@/lib/sections';

export function OperationForm({ action, label, description, fields, region, recordId, initial, openOnLoad }: {
  action: OperationId;
  label: string;
  description: string;
  fields: Field[];
  region: Region;
  recordId?: string;
  initial: Record<string, string>;
  openOnLoad?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const headingId = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [barcodes, setBarcodes] = useState<string[]>([]);
  useEffect(() => {
    if (openOnLoad && !dialog.current?.open) dialog.current?.showModal();
  }, [openOnLoad, recordId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(adminPath('/api/operations'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, recordId, region, values }),
      });
      if (!response.ok) {
        setError((await response.text()).slice(0, 320) || 'The change could not be saved.');
        return;
      }
      const result = await response.json();
      if (Array.isArray(result.barcodes) && result.barcodes.length) setBarcodes(result.barcodes);
      else dialog.current?.close();
      router.refresh();
    } catch {
      setError('The connection was interrupted. Check the record before retrying.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <>
    <button className="button secondary" onClick={() => {
      setError('');
      setBarcodes([]);
      dialog.current?.querySelector('form')?.reset();
      dialog.current?.showModal();
    }}>{label}</button>
    <dialog className="form-dialog" ref={dialog} aria-labelledby={headingId} onCancel={event => {
      if (busy) event.preventDefault();
    }}>
      <form className="stack-form" onSubmit={save}>
        <h2 id={headingId}>{label}</h2>
        <p>{description}</p>
        {barcodes.length ? <>
          <p role="status">{barcodes.length} barcode labels generated.</p>
          <label htmlFor={headingId + '-barcodes'}>Generated barcodes</label>
          <textarea id={headingId + '-barcodes'} readOnly rows={5} value={barcodes.join('\n')}/>
        </> : fields.map(field => <div className="operation-field" key={field.name}>
          <label htmlFor={headingId + '-' + field.name}>{field.label}</label>
          {field.type === 'select'
            ? <select id={headingId + '-' + field.name} name={field.name} defaultValue={initial[field.name] ?? ''} required={!field.optional}>
                <option value="" disabled>Choose {field.label.toLowerCase()}</option>
                {field.choices?.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            : field.type === 'textarea'
              ? <textarea id={headingId + '-' + field.name} name={field.name} required={!field.optional} maxLength={field.limit} rows={4} defaultValue={initial[field.name]}/>
              : <input id={headingId + '-' + field.name} name={field.name} type={field.type === 'decimal' ? 'number' : field.type ?? 'text'} required={!field.optional}
                  min={field.min} max={field.type === 'number' || field.type === 'decimal' ? field.limit : undefined}
                  step={field.type === 'decimal' ? '0.01' : undefined} maxLength={field.type === 'text' || !field.type ? field.limit : undefined}
                  defaultValue={initial[field.name]}/>}
        </div>)}
        {error && <p role="alert" className="notice warn">{error}</p>}
        <div className="page-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>
            {barcodes.length ? 'Done' : 'Cancel'}
          </button>
          {!barcodes.length && <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button>}
        </div>
      </form>
    </dialog>
  </>;
}
