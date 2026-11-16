'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { supplierFields, suppliersPath, supplierTypes, type SupplierRecord } from '@/lib/supplier-fields';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

export function SupplierEditor({ selected, region, inline = false }: { selected?: SupplierRecord; region: Region; inline?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const title = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const label = selected ? 'Edit supplier' : 'Add supplier';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const query = selected ? '?' + new URLSearchParams({ id: selected.id }) : '';
      const result = await fetch(adminPath('/api/purchases/suppliers' + query), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!result.ok) throw new Error((await result.text()).slice(0, 300));
      const saved: { id: string } = await result.json();
      if (inline) router.replace(suppliersPath + '/' + saved.id + '?' + new URLSearchParams({ region, saved: '1' }));
      else dialog.current?.close();
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'The connection was interrupted. Check the directory before retrying.' :
        failure instanceof Error && failure.message ? failure.message : 'The supplier could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const form = <form className={inline ? 'panel padded stack-form' : 'stack-form'} onSubmit={save}>
    {!inline && <h2 id={title}>{label}</h2>}
    <fieldset className="supplier-fields" disabled={busy}>
      <label className="filter-label">Supplier type<select name="type" defaultValue={selected?.type || 'BUSINESS'} required>
        {supplierTypes.map(type => <option key={type} value={type}>{type[0] + type.slice(1).toLowerCase()}</option>)}
      </select></label>
      {supplierFields.map(({ name, label, max }) => <label className="filter-label" key={name}>{label}
        {name === 'notes' || name === 'address' ? <textarea name={name} maxLength={max} rows={2} defaultValue={selected?.[name]}/> :
          <input name={name} maxLength={max} defaultValue={selected?.[name]} required={name === 'name' || name === 'contact_id'}
            type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
            inputMode={name === 'contact_id' ? 'numeric' : undefined} pattern={name === 'contact_id' ? '[0-9]{1,8}' : undefined}/>}</label>)}
    </fieldset>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="page-actions">
      {!inline && <button type="button" className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>}
      <button className="button primary" disabled={busy}>{busy ? 'Saving…' : inline ? 'Save supplier' : 'Confirm'}</button>
    </div>
  </form>;
  if (inline) return form;
  return <><button className="button secondary" onClick={() => {
    setError('');
    dialog.current?.querySelector('form')?.reset();
    dialog.current?.showModal();
  }}>{label}</button><dialog className="form-dialog" ref={dialog} aria-labelledby={title} onCancel={event => {
    if (busy) event.preventDefault();
  }}>{form}</dialog></>;
}

export function DeleteSupplier({ id, name, region }: { id: string; name: string; region: Region }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await fetch(adminPath('/api/purchases/suppliers?' + new URLSearchParams({ id, action: 'delete' })), { method: 'POST' });
      if (!result.ok) throw new Error();
      router.replace(suppliersPath + '?' + new URLSearchParams({ region, deleted: '1' }));
      router.refresh();
    } catch {
      setError('Could not remove the supplier. Refresh the record before trying again.');
      setBusy(false);
    }
  }
  return <><button type="button" className="button secondary" onClick={() => dialog.current?.showModal()}>Remove supplier</button>
    <dialog className="form-dialog" ref={dialog} aria-labelledby={title} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form className="stack-form" onSubmit={remove}><h2 id={title}>Remove supplier</h2><p>Remove {name} from the supplier directory? Existing purchases keep the supplier reference.</p>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</button></div></form>
    </dialog></>;
}
