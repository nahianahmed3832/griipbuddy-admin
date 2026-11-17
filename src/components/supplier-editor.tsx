'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { supplierFields, suppliersPath, supplierTypes, type SupplierRecord } from '@/lib/supplier-fields';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import design from './production-catalog-details.module.css';
import styles from './production-catalog.module.css';
import { ProductionCatalogActions } from './production-catalog-actions';

export function SupplierEditor({ selected, region, inline = false, production = false }: { selected?: SupplierRecord; region: Region; inline?: boolean; production?: boolean }) {
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
      if (production) router.replace('/dashboard/suppliers/all' + (region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : ''));
      else if (inline) router.replace(suppliersPath + '/' + saved.id + '?' + new URLSearchParams({ region, saved: '1' }));
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

  if (production) {
    const terms = ['Cash on Delivery', 'Net 7 Days', 'Net 15 Days', 'Net 30 Days', 'Net 60 Days'];
    const savedTerms = selected?.default_payment_terms;
    const recordType = selected?.type ?? 'INDIVIDUAL';
    const editableFields = [
      ['name', 'Supplier Name', 'Enter supplier name', 'text', true],
      ['contact_id', 'Contact ID', 'e.g., 1025', 'text', true],
      ['email', 'Email', 'supplier@example.com', 'email', true],
      ['phone', 'Phone', '+8801911223344', 'tel', true],
      ['address', 'Address', '32/A, Chawk Bazar, Chattogram', 'text', true],
      ['tax_info', 'Tax Information', 'NID: 1987654321', 'text', false],
    ] as const;
    const field = ([name, title, placeholder, type, required]: typeof editableFields[number]) => <label key={name}
      data-field={name} className={styles.field}>
      <span>{title}{required && <em aria-hidden="true"> *</em>}</span>
      <input name={name} type={type} placeholder={placeholder} maxLength={supplierFields.find(item => item.name === name)?.max}
        required={required && (!selected || Boolean(selected[name]) || name === 'name' || name === 'contact_id')}
        pattern={name === 'contact_id' ? '[0-9]{1,8}' : undefined} inputMode={name === 'contact_id' ? 'numeric' : undefined} defaultValue={selected?.[name]}/>
      {name === 'tax_info' && <small className={design.muted}>e.g., NID, TIN, VAT number</small>}
    </label>;
    return <form className={design.forms} onSubmit={save}>
      <fieldset className={design.supplierFields} disabled={busy}>
        {editableFields.slice(0, 2).map(field)}
        <label className={styles.field}>Supplier Type <em aria-hidden="true">*</em>
          <select className={styles.select} name="type" aria-label="Supplier Type" defaultValue={recordType} required>
            <option value="INDIVIDUAL">Individual</option><option value="COMPANY">Company</option>
            {recordType === 'BUSINESS' && <option value="BUSINESS">Business</option>}
          </select>
        </label>
        <label className={styles.field}>Payment Terms <em aria-hidden="true">*</em>
          <select className={styles.select} aria-label="Payment Terms" name="default_payment_terms" defaultValue={savedTerms || terms[0]} required>
            {[...new Set([...terms, ...(savedTerms ? [savedTerms] : [])])].map(term => <option key={term}>{term}</option>)}
          </select>
        </label>
        {editableFields.slice(2).map(field)}
        <label className={styles.field} data-field="notes">Notes<textarea name="notes" maxLength={1000} placeholder="e.g., Supplies fresh fish daily" defaultValue={selected?.notes}/></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={design.submit}>
        <button className={styles.primary} disabled={busy}>{busy ? 'Saving…' : selected ? 'Update Supplier' : 'Create Supplier'}</button>
      </div>
    </form>;
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

export function DeleteSupplier({ id, name, region, production = false }: { id: string; name: string; region: Region; production?: boolean }) {
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
      router.replace((production ? '/dashboard/suppliers/all' : suppliersPath) + '?' + new URLSearchParams({ region, deleted: '1' }));
      router.refresh();
    } catch {
      setError('Could not remove the supplier. Refresh the record before trying again.');
      setBusy(false);
    }
  }
  return <><button type="button" className="button secondary" onClick={() => dialog.current?.showModal()}>{production ? 'Delete Supplier' : 'Remove supplier'}</button>
    <dialog className="form-dialog" ref={dialog} aria-labelledby={title} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form className="stack-form" onSubmit={remove}><h2 id={title}>Remove supplier</h2><p>Remove {name} from the supplier directory? Existing purchases keep the supplier reference.</p>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</button></div></form>
    </dialog></>;
}

export function ProductionSupplierActions({ id, name, href, region, canEdit, canDelete }: {
  id: string; name: string; href: string; region: Region; canEdit: boolean; canDelete: boolean;
}) {
  return <ProductionCatalogActions label="Open menu">
    {close => <>
      {canEdit && <Link href={href} onClick={close}>Update Supplier</Link>}
      {canDelete && <DeleteSupplier id={id} name={name} region={region} production/>}
    </>}
  </ProductionCatalogActions>;
}
