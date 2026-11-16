'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import type { AssistantKind, AssistantStatus, CodEntry, Issue, Lookup, Order, Range } from '@/lib/operations-desk';
import type { Region } from '@/lib/sections';

export function useOperationsMutation(region: Region) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  async function submit(path: string, body: unknown, message: string, range?: Range,
    onSaved?: (value: unknown) => void) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      const params = new URLSearchParams({ region, ...(range && { from: range.from, to: range.to }) });
      const response = await fetch(adminPath('/api/operations/' + path + '?' + params), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) throw new Error(result?.message || 'The request could not be completed.');
      onSaved?.(result.data);
      setFeedback({ message, error: false });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Please try again.', error: true });
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { submit, pending, feedback };
}

export function OperationsFeedback({ value }: { value?: { message: string; error: boolean } }) {
  return value ? <p className={'ops-feedback' + (value.error ? ' ops-error' : '')} role={value.error ? 'alert' : 'status'}>{value.message}</p> : null;
}

export function OpsAction({ region, path, body, children, message, disabled, compact }: {
  region: Region; path: string; body: unknown; children: ReactNode; message: string; disabled?: boolean; compact?: boolean;
}) {
  const state = useOperationsMutation(region);
  return <div className={compact ? 'ops-action-inline' : undefined}>
    <button className="ops-button" type="button" disabled={disabled || state.pending}
      onClick={() => void state.submit(path, body, message)}>{children}</button>
    <OperationsFeedback value={state.feedback}/>
  </div>;
}

export function PackActions({ order, region }: { order: Order; region: Region }) {
  const state = useOperationsMutation(region);
  const [scans, setScans] = useState('');
  const allPicked = order.mode === 'picked' || order.lines.length > 0 && order.lines.every(line => line.picked === line.quantity);
  async function apply(action: 'pick' | 'pack') {
    const barcodes = scans.trim().split(/\s+/).filter(Boolean);
    if (await state.submit('packing/' + order.id, { action, shipment: order.shipment, ...(action === 'pick' && { barcodes }) },
      action === 'pack' ? 'Packing recorded.' : 'Picking recorded.')) setScans('');
  }
  if (order.mode === 'packed') return <form className="ops-form" onSubmit={event => {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    void state.submit('packing/' + order.id, { action: 'dispatch', shipment: order.shipment,
      tracking: input.get('tracking'), evidence: input.get('evidence') }, 'Dispatch recorded.');
  }}>
    <label>Tracking reference<input name="tracking" maxLength={80} required /></label>
    <label>Handoff evidence reference<input name="evidence" maxLength={80} required /></label>
    <button className="ops-button" disabled={state.pending}>Record dispatch</button>
    <OperationsFeedback value={state.feedback}/>
  </form>;
  return <div className="ops-pack-actions">
    {!allPicked && <form onSubmit={event => { event.preventDefault(); void apply('pick'); }} className="ops-form">
      <label>Scan unit barcodes<textarea value={scans} onChange={event => setScans(event.target.value)} rows={2}
        placeholder="One barcode per line" maxLength={6000} required={order.mode === 'barcode'}/></label>
      <button className="ops-button" disabled={state.pending}>{state.pending ? 'Saving…' : 'Record picking'}</button>
    </form>}
    {allPicked && <button type="button" className="ops-button" disabled={state.pending}
      onClick={() => void apply('pack')}>{state.pending ? 'Saving…' : 'Mark packed'}</button>}
    <OperationsFeedback value={state.feedback}/>
  </div>;
}

export function IssueActions({ issue: serverIssue, region, owner, actor, generatedDraft, staff }: {
  issue: Issue; region: Region; owner: boolean; actor: string; generatedDraft?: string;
  staff: { id: string; name: string }[];
}) {
  const state = useOperationsMutation(region);
  const [action, setAction] = useState('note');
  const [savedIssue, setSavedIssue] = useState<Issue>();
  const issue = savedIssue && savedIssue.revision > serverIssue.revision ? savedIssue : serverIssue;
  const remember = (value: unknown) => setSavedIssue(value as Issue);
  const open = ['open', 'in-progress'].includes(issue.status);
  const canEdit = owner || !issue.assignee || issue.assignee === actor;
  const approval = owner && issue.request && ['refund', 'cancellation'].includes(issue.request.category);
  if (!canEdit) return <p className="ops-muted">Assigned to another staff member.</p>;
  const target = 'issues/' + issue._id;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = String(values.get('text') ?? '').trim();
    if (await state.submit(target, { revision: issue.revision, action, ...(action === 'assign' ? { assignee: value } : { text: value || undefined }) },
      'Issue updated.', undefined, remember)) {
      form.reset();
      setAction('note');
    }
  }
  return <div className="ops-stack">
    {open && !issue.assignee && <button className="ops-button" type="button" disabled={state.pending}
      onClick={() => void state.submit(target, { revision: issue.revision, action: 'claim' }, 'Issue assigned to you.', undefined, remember)}>
      Claim issue</button>}
    {open && approval && issue.request?.stage === 'approved' && issue.request.category === 'cancellation' &&
      <details className="ops-disclosure"><summary>Cancel eligible unpaid COD order</summary>
        <p>The order service checks eligibility and releases the reservation. Then confirm completion on the request.</p>
        <OpsAction region={region} path={target + '/cancel-order'} body={{ revision: issue.revision }} disabled={state.pending}
          message="Cancellation recorded on the order.">Cancel order</OpsAction></details>}
    <form className="ops-form" onSubmit={save}>
      <label>Issue action<select value={action} onChange={event => setAction(event.target.value)}>
        <option value="note">Add internal note</option>
        {open && owner && <option value="assign">Assign to staff</option>}
        {open && <><option value="resolve">Resolve</option><option value="dismiss">Dismiss</option></>}
        {!open && <option value="reopen">Reopen</option>}
        {open && issue.request && <option value="draft">Save editable draft</option>}
        {open && approval && issue.request?.stage === 'requested' && <option value="approve">Record owner approval</option>}
        {open && approval && issue.request?.stage === 'approved' && <option value="complete">Confirm against completed evidence</option>}
      </select></label>
      {action === 'assign' ? <label>Staff account<input name="text" list="ops-assignees" pattern="[a-fA-F0-9]{24}" required/>
        <datalist id="ops-assignees">{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</datalist></label> :
      <label>{action === 'draft' ? 'Reply draft' : action === 'complete'
        ? issue.request?.category === 'refund' ? 'Completed refund record ID' : 'Cancellation is checked against order history' : 'Note or reason'}
      <textarea key={action} name="text" rows={action === 'draft' ? 5 : 2} maxLength={action === 'draft' ? 2000 : 800}
        defaultValue={action === 'draft' ? issue.request?.draft || generatedDraft : undefined}
        required={action !== 'complete' || issue.request?.category === 'refund'} /></label>}
      <button className="ops-button" disabled={state.pending}>{state.pending ? 'Saving…' : 'Save issue'}</button>
      <OperationsFeedback value={state.feedback}/>
    </form>
  </div>;
}

export function SupportForm({ order, region }: { order: string; region: Region }) {
  const state = useOperationsMutation(region);
  const request = useRef('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    request.current ||= crypto.randomUUID();
    if (await state.submit('support', { order, category: values.get('category'), details: values.get('details'), request: request.current },
      'Request added to the support queue.')) {
      form.reset();
      request.current = '';
    }
  }
  return <form onSubmit={save} className="ops-form">
    <label>Request category<select name="category"><option value="delivery">Delivery</option><option value="product">Product</option>
      <option value="cancellation">Cancellation</option><option value="refund">Refund</option><option value="other">Other</option></select></label>
    <label>Request details<textarea name="details" maxLength={1200} rows={4} required/></label>
    <button className="ops-button" disabled={state.pending}>{state.pending ? 'Saving…' : 'Create support request'}</button>
    <OperationsFeedback value={state.feedback}/>
  </form>;
}

export function CodForm({ entry, region }: { entry?: CodEntry; region: Region }) {
  const state = useOperationsMutation(region);
  const [kind, setKind] = useState(entry?.kind ?? 'collection');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = (name: string) => String(values.get(name) ?? '').trim();
    const currency = value('currency').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return;
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(value('amount'));
    if (!match || (match[2]?.length ?? 0) > digits) {
      (form.elements.namedItem('amount') as HTMLInputElement).setCustomValidity('Enter an amount using the currency’s minor units.');
      form.reportValidity();
      return;
    }
    const amount = Number(match[1] + (match[2] ?? '').padEnd(digits, '0'));
    const fields = { currency, amount, status: value('status'), occurredAt: value('occurredAt'), evidence: value('evidence'),
      batch: value('batch') || undefined, order: kind === 'collection' ? value('order') || undefined : undefined };
    const data = entry ? { ...fields, revision: entry.revision, reason: value('reason') } :
      { ...fields, kind, courier: value('courier'), reference: value('reference') };
    if (await state.submit('cod' + (entry ? '/' + entry._id : ''), data, entry ? 'Correction recorded.' : 'Source row recorded.')) {
      if (!entry) form.reset();
    }
  }
  const decimals = entry ? new Intl.NumberFormat('en', { style: 'currency', currency: entry.currency }).resolvedOptions().maximumFractionDigits ?? 2 : 2;
  const amount = entry ? (entry.amount / 10 ** decimals).toFixed(decimals) : '';
  return <form onSubmit={save} className="ops-form">
    <div className="ops-form-grid">
      {!entry && <>
        <label>Entry type<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
          <option value="collection">Collection</option><option value="fee">Fee or deduction</option><option value="settlement">Settlement</option>
        </select></label>
        <label>Courier<input name="courier" placeholder="STEADFAST" maxLength={80} required/></label>
        <label>Source row reference<input name="reference" maxLength={80} required/></label>
      </>}
      <label>Batch reference<input name="batch" maxLength={80} defaultValue={entry?.batch}/></label>
      {kind === 'collection' && <label>Order ID, if known<input name="order" pattern="[A-Fa-f0-9]{24}" defaultValue={entry?.order}/></label>}
      <label>Currency<input name="currency" pattern="[A-Za-z]{3}" maxLength={3} defaultValue={entry?.currency ?? (region === 'BD' ? 'BDT' : 'USD')} required/></label>
      <label>Amount<input name="amount" inputMode="decimal" maxLength={18} defaultValue={amount} required onInput={event => event.currentTarget.setCustomValidity('')}/></label>
      <label>Source timestamp<input name="occurredAt" placeholder="2026-11-14T09:30:00+06:00" maxLength={40} defaultValue={entry?.occurredAt} required/></label>
      <label>Verification status<select key={kind} name="status" defaultValue={entry?.status ?? 'reported'}>
        <option value="reported">Reported, unverified</option>{kind === 'settlement' && <option value="received">Received, unverified</option>}
        <option value="verified">Verified against evidence</option></select></label>
      <label>Evidence reference<input name="evidence" maxLength={80} defaultValue={entry?.evidence} required/></label>
    </div>
    {entry && <label>Correction reason<textarea name="reason" required minLength={5} maxLength={800} rows={2}/></label>}
    <button className="ops-button" disabled={state.pending}>{state.pending ? 'Saving…' : entry ? 'Save correction' : 'Record entry'}</button>
    <OperationsFeedback value={state.feedback}/>
  </form>;
}

export function ManagedCodCollection({ region }: { region: Region }) {
  const state = useOperationsMutation(region);
  return <details className="ops-disclosure"><summary>Record collection on a delivered COD order</summary>
    <form className="ops-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const order = String(data.get('order'));
      void state.submit('cod/orders/' + order + '/collect', { reference: data.get('reference'),
        amount: Number(data.get('minor')) }, 'COD collection recorded on the order.');
    }}>
      <label>Managed order ID<input name="order" pattern="[a-f0-9]{24}" required /></label>
      <label>Documented collection in minor units<input name="minor" type="number" min="1" step="1" required /></label>
      <label>Collection evidence reference<input name="reference" maxLength={80} required /></label>
      <button className="ops-button" disabled={state.pending}>Record collection on order</button>
      <OperationsFeedback value={state.feedback}/>
    </form>
  </details>;
}

export function ManualFulfillment({ order, region }: { order: Lookup; region: Region }) {
  const state = useOperationsMutation(region);
  const attempt = useRef<{ form: string; key: string; at: string } | null>(null);
  const plan = order.canPlanShipment === true;
  const label = plan ? 'Plan packing' : 'Record delivery';
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const form = JSON.stringify([...data.entries()]);
    if (attempt.current?.form !== form) {
      attempt.current = { form, key: crypto.randomUUID(), at: new Date().toISOString() };
    }
    const { key, at } = attempt.current;
    const body = plan ? { action: 'plan', key, grams: Number(data.get('grams')), length: Number(data.get('length')),
      width: Number(data.get('width')), height: Number(data.get('height')) }
      : { action: 'deliver', shipment: order.manualShipment?.id, at, evidence: data.get('evidence') };
    void state.submit('fulfillment/' + order.id, body, plan ? 'Order sent to the packing queue.' : 'Delivery recorded.');
  }
  return <details className="ops-disclosure"><summary>{label}</summary>
    <form className="ops-form" onSubmit={save}>
      {plan ? <div className="ops-form-grid">
        <label>Parcel weight (g)<input name="grams" type="number" min="1" max="100000" required /></label>
        <label>Parcel length (cm)<input name="length" type="number" min="1" max="300" required /></label>
        <label>Parcel width (cm)<input name="width" type="number" min="1" max="300" required /></label>
        <label>Parcel height (cm)<input name="height" type="number" min="1" max="300" required /></label>
      </div> : <label>Delivery evidence reference<input name="evidence" maxLength={80} required /></label>}
      <button className="ops-button" disabled={state.pending}>{plan ? 'Send to packing' : 'Confirm delivery'}</button>
      <OperationsFeedback value={state.feedback}/>
    </form>
  </details>;
}

export function AssistantAction({ status, region, kind, issue, range }: {
  status: AssistantStatus; region: Region; kind: AssistantKind; issue?: string; range?: Range;
}) {
  const state = useOperationsMutation(region);
  const request = useRef('');
  const submit = async () => {
    request.current ||= crypto.randomUUID();
    if (await state.submit('assistant', { kind, issue, request: request.current }, 'Assistant run saved.', range)) request.current = '';
  };
  const title = { briefing: 'Generate operations briefing', explanation: 'Explain issue', draft: 'Generate response draft' }[kind];
  return <div>
    <button className="ops-button" type="button" disabled={!status.available || state.pending} onClick={() => void submit()}>
      {state.pending ? 'Generating…' : state.feedback?.error && status.failure?.error === 'retryable' ? 'Retry run' : title}</button>
    <OperationsFeedback value={state.feedback}/>
  </div>;
}
