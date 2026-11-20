'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OperationsFeedback, useOperationsMutation } from './operations-forms';
import type { Region } from '@/lib/sections';
import { workerLabels, type Rule, type WorkDetail, type WorkQueue, type WorkRole } from '@/lib/workforce';

export function WorkRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}

export function PauseControls({ region, runner, merchandising }: { region: Region; runner: WorkQueue['runner']; merchandising?: boolean }) {
  const state = useOperationsMutation(region);
  const [revision, setRevision] = useState(runner.revision ?? 0);
  const [optimistic, setOptimistic] = useState(runner);
  const local = revision > (runner.revision ?? 0) ? optimistic : runner;
  const controls: [string, string, boolean][] = [['all', 'All workers', local.paused],
    ...(['customer-support', 'inventory', ...(merchandising ? ['merchandising'] : [])] as WorkRole[]).map((role): [string, string, boolean] =>
      [role, workerLabels[role], Boolean(local.roles?.includes(role))])];
  return <div className="ops-stack">
    <div className="ops-work-controls">{controls.map(([role, name, paused]) => <div className="ops-result" key={role}>
      <h3>{name}</h3><p className="ops-muted">{paused ? 'Paused' : 'Allowed to claim'}</p>
      <button className="ops-button" type="button" disabled={state.pending || !local.revision}
        onClick={() => void state.submit('work/pause', { role, paused: !paused, revision: local.revision }, 'Worker controls saved.', undefined,
          data => { const next = data as WorkQueue['runner']; setRevision(next.revision ?? 0); setOptimistic(next); })}>
        {paused ? 'Resume' : 'Pause'} {role === 'all' ? 'all work' : name.toLowerCase()}</button>
    </div>)}</div>
    <OperationsFeedback value={state.feedback}/>
  </div>;
}

export function WorkReviewForm({ region, task, actor, owner }: { region: Region; task: WorkDetail; actor: string; owner: boolean }) {
  const state = useOperationsMutation(region);
  const [saved, setSaved] = useState<WorkDetail>();
  const current = saved && saved.revision > task.revision ? { ...task, ...saved } : task;
  const scoped = owner || !current.origin?.assignee || current.origin.assignee === actor;
  const support = current.role === 'customer-support';
  const records = current.outcome?.records ?? [];
  const nextOutcome = support ? 'customer-message-sent' : records.length ? 'stock-received' : 'supplier-order-placed';
  const nextToVerify = records.find(row => !row.verifiedSource)?.kind ?? nextOutcome;
  const actions = [
    ...(current.role !== 'merchandising' && current.state === 'succeeded' && current.reviewState === 'awaiting'
      ? [...(support ? [['edit', 'Save edited draft']] : []), ['accept', 'Approve result'], ['reject', 'Reject result']] : []),
    ...(current.role !== 'merchandising' && current.state === 'succeeded' && !current.outcome ? [['revise', 'Request revision']] : []),
    ...(['failed', 'blocked'].includes(current.state) && current.reason !== 'provider-unconfigured' ? [['retry', 'Requeue work']] : []),
    ...(['queued', 'running', 'blocked', 'failed'].includes(current.state) ? [['cancel', 'Cancel work']] : []),
    ...(current.reviewState === 'approved' && records.length < (support ? 1 : 2)
      ? [['outcome', 'Report an action manually']] : []),
    ...(current.reviewState === 'approved' && (records.some(row => !row.verifiedSource) || records.length < (support ? 1 : 2))
      ? [['verify', 'Verify against an existing record']] : []),
  ];
  const [selected, setSelected] = useState('');
  const action = actions.some(([value]) => value === selected) ? selected : actions[0]?.[0];
  if (!scoped) return <p className="ops-muted">The source request is assigned to another support employee.</p>;
  if (!action) return <p className="ops-muted">No review action is available in the current state.</p>;
  const editable = support && (action === 'edit' || action === 'accept');
  const external = action === 'outcome' || action === 'verify';
  const verify = action === 'verify';
  const kind = verify ? nextToVerify : nextOutcome;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form);
    const value = (key: string) => String(input.get(key) ?? '').trim() || undefined;
    const payload = { action, revision: current.revision, result: current.result, draft: editable ? value('draft') : undefined,
      reason: value('reason'), ...(external && { kind, reference: value('reference'), at: value('at') }) };
    await state.submit('work/' + current._id, payload, 'Work record saved.', undefined, result => setSaved(result as WorkDetail));
  }
  return <form className="ops-form" onSubmit={submit}>
    <label>Review action<select value={action} onChange={event => setSelected(event.target.value)}>
      {actions.map(([name, label]) => <option key={name} value={name}>{label}</option>)}
    </select></label>
    {editable && <label>Editable reply draft<textarea name="draft" key={current.revision + ':' + action} rows={6} maxLength={2000} required
      defaultValue={current.review?.draft ?? current.latest?.output.draft}/></label>}
    {external && <>
      <p className="ops-muted">Action being recorded · {kind.replaceAll('-', ' ')}</p>
      <label>{verify ? 'Existing record ID' : 'Execution evidence reference'}
        <input name="reference" maxLength={80} pattern={verify ? '[A-Fa-f0-9]{24}' : undefined} required/></label>
      {!verify && <label>Occurred at<input name="at" placeholder="2026-11-14T09:30:00+06:00" maxLength={40} required/></label>}
    </>}
    {!editable && !external && <label>Decision reason<textarea name="reason" rows={3} maxLength={600} required/></label>}
    {action === 'accept' && current.freshness !== 'current' && <p className="ops-notice">Recheck the source facts and request a fresh result before approval.</p>}
    <button className="ops-button" disabled={state.pending || action === 'accept' && current.freshness !== 'current'}>
      {state.pending ? 'Saving…' : 'Save review action'}</button>
    <OperationsFeedback value={state.feedback}/>
  </form>;
}

export function ReplenishmentForm({ region, task, initial }: { region: Region; task: string; initial?: Rule }) {
  const state = useOperationsMutation(region);
  const [saved, setSaved] = useState<Rule>();
  const rule = saved && saved.version > (initial?.version ?? 0) ? saved : initial;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const result = { version: rule?.version ?? 0, target: Number(values.get('target')), supplier: values.get('supplier'),
      termsReference: values.get('termsReference'), demandReference: values.get('demandReference'), validThrough: values.get('validThrough') };
    await state.submit('work/' + task + '/rule', result, 'Rule saved. Request a fresh calculation to review the change.', undefined,
      next => setSaved(next as Rule));
  }
  return <details className="ops-disclosure">
    <summary>Replenishment rule</summary>
    <form className="ops-form" onSubmit={submit}>
      <p>Use the approved target and source references for this SKU.</p>
      <div className="ops-form-grid">
        <label>Approved target units<input name="target" type="number" min={0} max={1000000} required defaultValue={rule?.target}/></label>
        <label>Supplier record ID<input name="supplier" pattern="[a-fA-F0-9]{24}" required defaultValue={rule?.supplier}/></label>
        <label>Supplier terms reference<input name="termsReference" maxLength={80} required defaultValue={rule?.termsReference}/></label>
        <label>Demand history reference<input name="demandReference" maxLength={80} required defaultValue={rule?.demandReference}/></label>
        <label>Rule expiry with timezone<input name="validThrough" maxLength={40} placeholder="2026-12-14T09:30:00+06:00"
          required defaultValue={rule?.validThrough}/></label>
      </div>
      <button className="ops-button" disabled={state.pending}>{state.pending ? 'Saving…' : 'Save replenishment rule'}</button>
      <OperationsFeedback value={state.feedback}/>
    </form>
  </details>;
}
