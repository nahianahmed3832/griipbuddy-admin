'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';

export function MarketForm({ id, name, code, currency, active }: { id: string; name: string; code: string; currency: string; active: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(adminPath('/api/market'), {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,currency:form.get('currency'),isActive:form.get('active') === 'true'}),
      });
      if (!response.ok) throw new Error();
      dialog.current?.close();
      router.refresh();
    } catch { setError('Market settings could not be saved.'); } finally { setBusy(false); }
  }
  return <><button className="button primary" onClick={() => { setError(''); dialog.current?.showModal(); }}>Edit market</button>
    <dialog className="form-dialog" ref={dialog} aria-labelledby="market-form-heading">
      <form onSubmit={save} className="stack-form">
        <h2 id="market-form-heading">Edit {name}</h2><p>{code} · changes apply to the isolated country record.</p>
        <label>Currency<select name="currency" defaultValue={currency}>{['BDT','USD','EUR','AUD'].map(code => <option key={code}>{code}</option>)}</select></label>
        <label>Country status<select name="active" defaultValue={String(active)}><option value="true">Active</option><option value="false">Inactive</option></select></label>
        {error && <div role="alert" className="notice warn">{error}</div>}
        <div className="page-actions"><button className="button secondary" type="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </dialog>
  </>;
}
