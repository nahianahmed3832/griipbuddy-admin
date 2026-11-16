'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { adminPath } from '@/lib/paths';
import type { EditorFields, Registry } from '@/lib/catalog-edit-fields';
import type { Region } from '@/lib/sections';

export type CatalogFormKind = Registry | 'products';
type CatalogRequest = { kind: CatalogFormKind; id?: string; region: Region; action: string; values: Record<string, unknown> };
export async function saveCatalog(request: CatalogRequest) {
  const response = await fetch(adminPath('/api/catalog-edit'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.saved !== true) throw new Error(result?.error || 'The catalog change could not be saved.');
  return typeof result.id === 'string' ? result.id : '';
}

export function CatalogFields({ fields, initial = {} }: { fields: EditorFields; initial?: Record<string, string> }) {
  const uid = useId();
  return <>{fields.map(({ name, label, kind, max, required, defaultValue, choices }) => {
    const id = uid + '-' + name;
    const start = initial[name] ?? defaultValue ?? '';
    return <label className="operation-field" key={name} htmlFor={id}>{label}{kind === 'boolean' || kind === 'choice' ?
      <select id={id} name={name} defaultValue={kind === 'boolean' ? start || 'false' : start} required={required}>
        {kind === 'boolean' ? <><option value="true">Yes</option><option value="false">No</option></> : <>
          <option value="" disabled>Choose</option>{choices?.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </>}
      </select> : kind === 'long' || kind === 'lines' || kind === 'json' ?
        <textarea id={id} name={name} defaultValue={start} maxLength={max} rows={kind === 'long' ? 5 : 3}
          required={required} placeholder={kind === 'lines' ? 'One entry per line' : undefined}/>
        : <input id={id} name={name} type={kind === 'url' || kind === 'number' ? kind : 'text'} defaultValue={start}
          min={kind === 'number' ? '0' : undefined} step={kind === 'number' ? '.01' : undefined}
          maxLength={kind === 'number' ? undefined : max ?? 2000} required={required}/>}
    </label>;
  })}</>;
}

export function CatalogEditForm({ kind, id, region, action = 'save', fields, initial, label, finish, children }: {
  kind: CatalogFormKind; id?: string; region: Region; action?: string; fields: EditorFields; initial?: Record<string, string>;
  label: string; finish?: string; children?: ReactNode;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(''); setNote('');
    try {
      const record = await saveCatalog({ kind, id, region, action, values: Object.fromEntries(new FormData(event.currentTarget)) });
      if (finish) router.push(finish.replace(':id', encodeURIComponent(record)));
      else { setNote('Saved.'); router.refresh(); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'The catalog change could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <form className="stack-form" onSubmit={submit}>
    {children}<CatalogFields fields={fields} initial={initial}/>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {note && <p className="notice" role="status">{note}</p>}
    <div className="page-actions"><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : label}</button></div>
  </form>;
}

export function CatalogConfirm({ kind, id, region, action, label, description, finish, values = {} }: {
  kind: CatalogFormKind; id?: string; region: Region; action: string; label: string; description: string; finish?: string;
  values?: Record<string, unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const heading = useId();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await saveCatalog({ kind, id, region, action, values });
      ref.current?.close();
      if (finish) router.push(finish);
      router.refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'The catalog change could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <><button type="button" className="button secondary" onClick={() => { setError(''); ref.current?.showModal(); }}>{label}</button>
    <dialog className="form-dialog" ref={ref} aria-labelledby={heading} onCancel={event => { if (busy.current) event.preventDefault(); }}>
      <form className="stack-form" onSubmit={confirm}><h2 id={heading}>{label}</h2><p>{description}</p>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button></div></form>
    </dialog>
  </>;
}
