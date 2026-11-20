'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Pencil, Plus, Shield, UserRoundPlus, X } from 'lucide-react';
import { customersPath, type Customer } from '@/lib/customers';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

async function saveCustomer(body: object, id?: string) {
  const response = await fetch(adminPath('/api/customers') + (id ? '?id=' + id : ''), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'Customer request failed.');
  return await response.json() as { id: string };
}

function Feedback({ error }: { error: string }) {
  return error && <div className="notice warn" role="alert"><CircleAlert size={16}/>{error}</div>;
}

export function CustomerCreateForm({ region }: { region: Region }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { id } = await saveCustomer(fields);
      router.push(customersPath + '/' + id + '?region=' + region);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create customer.');
      setBusy(false);
    }
  }

  return <div className="crm-create-layout">
    <section className="panel">
      <div className="panel-header"><div><h2>Contact information</h2><p>Enter the details the customer uses with GriipBuddy.</p></div></div>
      <form onSubmit={submit} className="stack-form padded crm-create-form">
        <label>Full name <input name="full_name" required autoComplete="name" maxLength={120} placeholder="Customer’s name"/></label>
        <label>Mobile number <input name="phone_number" required type="tel" autoComplete="tel" maxLength={32} placeholder="01XXXXXXXXX"/></label>
        <label>Email address (optional) <input name="email" type="email" autoComplete="email" maxLength={254} placeholder="name@example.com"/></label>
        <Feedback error={error}/>
        <div className="page-actions"><button className="button primary" disabled={busy}><UserRoundPlus size={16}/>{busy ? 'Creating…' : 'Create customer'}</button></div>
      </form>
    </section>
    <aside className="panel crm-create-guide padded">
      <span className="tile-icon green"><Shield size={19}/></span>
      <h2>Customer verification</h2>
      <p>The customer record starts as pending. The customer can complete storefront registration with this mobile number and verify it using their one-time code.</p>
      <p>Creating the record sends no message. The customer chooses their own password when they sign up.</p>
    </aside>
  </div>;
}

export function CustomerActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<'edited' | 'status'>('edited');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deactivate = customer.status === 'ACTIVE';
  const statusLabel = deactivate ? 'Deactivate account' : 'Reactivate account';

  function open(mode: 'edited' | 'status') {
    setKind(mode);
    setError('');
    dialog.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const revision = customer.updatedAt || null;
    const body = kind === 'edited' ? {
      kind, revision, full_name: fields.get('full_name'), email: fields.get('email'),
      tags: String(fields.get('tags') ?? '').split(',').map(tag => tag.trim()).filter(Boolean),
    } : { kind, revision, status: deactivate ? 'INACTIVE' : 'ACTIVE', detail: fields.get('detail') };
    setBusy(true);
    setError('');
    try {
      await saveCustomer(body, customer._id);
      dialog.current?.close();
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save customer.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="button secondary" onClick={() => open('edited')}><Pencil size={14}/> Edit profile</button>
    {customer.is_verified_number && ['ACTIVE', 'INACTIVE'].includes(customer.status ?? '') &&
      <button type="button" className="button secondary" onClick={() => open('status')}><Shield size={14}/> {statusLabel}</button>}
    <dialog className="form-dialog" ref={dialog} aria-labelledby="crm-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }}
      onClose={() => dialog.current?.querySelector('form')?.reset()}>
      <form className="stack-form" key={kind + (customer.updatedAt ?? '')} onSubmit={submit}>
        <div className="crm-dialog-header"><h2 id="crm-dialog-title">{kind === 'edited' ? 'Edit profile' : statusLabel}</h2>
          <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={() => dialog.current?.close()}><X size={16}/></button></div>
        {kind === 'edited' ? <>
          <label>Full name <input name="full_name" required maxLength={120} defaultValue={customer.full_name}/></label>
          <label>Email address (optional) <input name="email" type="email" maxLength={254} defaultValue={customer.email}/></label>
          <label>Tags (optional) <input name="tags" maxLength={155} defaultValue={customer.workspace_tags?.join(', ')} placeholder="vip, follow-up"/>
            <small className="muted">Use commas to separate up to six tags of 24 characters each.</small></label>
        </> : <>
          <p>{deactivate ? 'Deactivation prevents new password sign-ins for this account.' : 'Reactivation allows this customer to sign in again.'} The reason is saved in staff activity.</p>
          <label>Reason <textarea name="detail" rows={3} required minLength={5} maxLength={500}/></label>
        </>}
        <Feedback error={error}/>
        <div className="page-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Saving…' : kind === 'edited' ? 'Save changes' : statusLabel}</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function CustomerNote({ id, activityPath, page }: { id: string; activityPath: string; page: number }) {
  const router = useRouter();
  const requestId = useRef('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ error: '', success: '' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const detail = String(new FormData(form).get('detail') ?? '');
    requestId.current ||= Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    setBusy(true);
    setFeedback({ error: '', success: '' });
    try {
      await saveCustomer({ kind: 'note', detail, requestId: requestId.current }, id);
      requestId.current = '';
      form.reset();
      setFeedback({ error: '', success: 'Note added.' });
      if (page > 1) router.replace(activityPath);
      else router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : 'Could not add note.', success: '' });
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack-form crm-note padded" onSubmit={submit}>
    <label>Staff note <textarea name="detail" rows={3} required maxLength={1000} disabled={busy}
      placeholder="Record a support interaction or follow-up." onChange={() => { requestId.current = ''; }}/></label>
    <Feedback error={feedback.error}/>
    {feedback.success && <small className="muted" role="status">{feedback.success}</small>}
    <button className="button secondary" disabled={busy}><Plus size={15}/>{busy ? 'Adding…' : 'Add note'}</button>
  </form>;
}
