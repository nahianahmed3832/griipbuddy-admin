'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { ManagedAction } from '@/lib/managed';
import { adminPath } from '@/lib/paths';

export type ManagedField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'decimal' | 'boolean' | 'json' | 'multiline' | 'datetime' | 'select';
  choices?: string[];
  value?: string | number | boolean;
  optional?: boolean;
  hint?: string;
};

export function ManagedForm({ label, action, fields, market, id, step, revision, primary = false, description }: {
  label: string; action: ManagedAction; fields: ManagedField[]; market: string; id?: string; step?: string;
  revision?: number | null; primary?: boolean; description?: string;
}) {
  const router = useRouter();
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef('');
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const input = new FormData(event.currentTarget);
      const values: Record<string, unknown> = revision === undefined ? {} : { revision };
      for (const field of fields) {
        const raw = String(input.get(field.name) ?? '').trim();
        if (field.optional && !raw) {
          if (field.type === 'datetime' && field.value) values[field.name] = null;
          continue;
        }
        switch (field.type) {
          case 'json':
            try { values[field.name] = JSON.parse(raw); }
            catch { setError(field.label + ' requires valid JSON.'); return; }
            break;
          case 'boolean': values[field.name] = raw === 'true'; break;
          case 'number':
          case 'decimal': values[field.name] = Number(raw); break;
          case 'datetime': values[field.name] = new Date(raw + 'Z').toISOString(); break;
          default: values[field.name] = raw;
        }
      }
      const record = action === 'collection' ? id ?? values.slug : id;
      if (action === 'collection') delete values.slug;
      key.current ||= crypto.randomUUID();
      const response = await fetch(adminPath('/api/managed'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, market, id: record, step, values, key: key.current }),
      });
      if (!response.ok) { setError(await response.text() || 'The operation could not be confirmed.'); return; }
      await response.json();
      key.current = '';
      dialog.current?.close();
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: 'Operation completed.' }));
      router.refresh();
    } catch {
      setError('The request could not be confirmed. Check the record before retrying.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <>
    <button type="button" className={'button ' + (primary ? 'primary' : 'secondary')} onClick={() => {
      setError('');
      dialog.current?.querySelector('form')?.reset();
      dialog.current?.showModal();
    }}>{label}</button>
    <dialog ref={dialog} className="form-dialog managed-dialog" aria-labelledby={heading} onCancel={event => {
      if (busy.current) event.preventDefault();
    }}>
      <form className="stack-form" aria-busy={saving} onSubmit={submit} onChange={() => { key.current = ''; }}>
        <div><h2 id={heading}>{label}</h2><p>{description || 'Confirm the change in the ' + market + ' workspace.'}</p></div>
        <fieldset className="managed-fields managed-inputs" disabled={saving}>{fields.map(field => {
          const value = String(field.value ?? '');
          const required = !field.optional;
          return <label key={field.name}>
            <span>{field.label}{field.type === 'datetime' ? ' (UTC)' : ''}</span>
            {field.type === 'boolean' ? <select name={field.name} defaultValue={value || 'false'}><option value="false">No</option><option value="true">Yes</option></select>
              : field.type === 'select' ? <select name={field.name} defaultValue={value} required={required}>
                <option value="">Choose an option</option>{field.choices?.map(choice => <option key={choice}>{choice}</option>)}</select>
              : field.type === 'json' || field.type === 'multiline' ? <textarea name={field.name} defaultValue={value} required={required}
                rows={field.type === 'json' ? 4 : 3} spellCheck={field.type !== 'json'} maxLength={40_000} className={field.type === 'json' ? 'code-input' : undefined}/>
              : <input name={field.name} defaultValue={field.type === 'datetime' ? value.slice(0,23) : value}
                type={field.type === 'datetime' ? 'datetime-local' : field.type === 'decimal' ? 'number' : field.type ?? 'text'} maxLength={240} step={field.type === 'number' ? '1' : field.type === 'datetime' ? '0.001' : field.type === 'decimal' ? '0.01' : undefined} required={required}/>}
            {field.hint && <small>{field.hint}</small>}
          </label>;
        })}</fieldset>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions">
          <button type="button" className="button secondary" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function SupplierUpload({ supplier, path }: { supplier: string; path: string }) {
  const router = useRouter();
  const key = useRef('');
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    key.current ||= crypto.randomUUID();
    form.set('key', key.current);
    form.set('supplier', supplier);
    try {
      const res = await fetch(adminPath('/api/managed'), { method: 'POST', body: form });
      if (!res.ok) { setError(await res.text() || 'The import could not be queued.'); return; }
      const { id } = await res.json();
      key.current = '';
      router.push(path + '&record=' + encodeURIComponent(id));
    } catch {
      setError('The import could not be confirmed. Retry with the same file and options.');
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  return <form className="panel padded stack-form" onSubmit={submit} onChange={() => { key.current = ''; }}>
    <h2>Queue an approved supplier feed</h2>
    <p>Use a CSV or XLSX up to 4 MiB. The import worker processes the file and records individual row outcomes.</p>
    <fieldset disabled={pending} className="upload-fields">
      <label>Supplier feed <input name="file" type="file" accept=".csv,.xlsx" required/></label>
      <label><input type="checkbox" name="confirmedApproved" value="true" required/> This feed is approved for this supplier</label>
      <label><input type="checkbox" name="createDrafts" value="true"/> Create drafts when source mappings are complete</label>
    </fieldset>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <button className="button primary" disabled={pending}>{pending ? 'Queuing…' : 'Queue import'}</button>
  </form>;
}

export function GalleryUpload() {
  const [asset, setAsset] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setAsset('');
    setError('');
    try {
      const response = await fetch(adminPath('/api/managed?asset=1'), { method:'POST',body:new FormData(event.currentTarget) });
      if (!response.ok) { setError(await response.text() || 'The image could not be uploaded.'); return; }
      const { id } = await response.json();
      setAsset(id);
    } catch {
      setError('The image upload could not be confirmed.');
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  return <form className="panel padded stack-form" onSubmit={upload}>
    <h2>Gallery assets</h2>
    <p>The catalog processes images and returns an asset ID. Add the ID to the draft gallery to use it.</p>
    <label>Catalog image <input name="file" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} required/></label>
    <button className="button secondary" disabled={pending}>{pending ? 'Uploading…' : 'Upload image'}</button>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {asset && <label>New gallery asset ID<input readOnly value={asset}/></label>}
  </form>;
}
