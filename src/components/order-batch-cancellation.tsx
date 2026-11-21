'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBrowserReady } from '@/lib/browser-ready';
import { adminPath } from '@/lib/paths';
import { statusLabel } from '@/lib/website-orders';

type OrderReference = { id: string; label: string };
type Attempt = { key: string; digest: string; orders: OrderReference[] };
type Result = { id: string; status: 'cancelled' | 'replayed' | 'unavailable' | 'ineligible'; message?: string };

function loadAttempt(storageKey: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Attempt | null;
    if (value && /^[a-f0-9-]{36}$/i.test(value.key) && /^[a-f0-9]{64}$/.test(value.digest) &&
        Array.isArray(value.orders) && value.orders.length > 0 && value.orders.length <= 25 &&
        value.orders.every(row => /^[a-f0-9]{24}$/i.test(row?.id) && typeof row.label === 'string' && row.label.length <= 120)) return value;
  } catch { /* The form can still keep an operation in memory. */ }
  return null;
}

export function OrderBatchCancellation({ actor, selection, onBusy, onConfirmed }: {
  actor: string;
  selection: OrderReference[];
  onBusy: (busy: boolean) => void;
  onConfirmed: (completed: string[]) => void;
}) {
  const storageKey = 'order-batch-cancellation:BD:' + actor;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [reason, setReason] = useState('');
  const [issue, setIssue] = useState('');
  const [results, setResults] = useState<{ order: OrderReference; result: Result }[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const ready = useBrowserReady();

  useEffect(() => { setAttempt(loadAttempt(storageKey)); }, [storageKey]);

  async function cancelSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !reason.trim()) return;
    const orders = attempt?.orders ?? selection;
    if (!orders.length) return;
    const values = { orders: orders.map(row => row.id), reason: reason.trim() };
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setIssue('');
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(values));
      const checksum = await crypto.subtle.digest('SHA-256', bytes);
      const digest = Array.from(new Uint8Array(checksum), byte => byte.toString(16).padStart(2, '0')).join('');
      if (attempt && attempt.digest !== digest) {
        setIssue('Enter the original reason to recover this batch. No new request was sent.');
        return;
      }
      const request = attempt ?? { digest, orders, key: crypto.randomUUID() };
      setAttempt(request);
      try { sessionStorage.setItem(storageKey, JSON.stringify(request)); } catch { /* Use the in-memory retry key. */ }
      const response = await fetch(adminPath('/api/managed'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'order-cancel-batch', market: 'BD', key: request.key, values }) });
      if (!response.ok) throw new Error((await response.text()).slice(0, 320));
      const { rows } = await response.json() as { rows?: Result[] };
      if (!Array.isArray(rows) || rows.length !== orders.length) throw new Error('The service did not return all results.');
      const byId = new Map(rows.map(row => [row.id, row]));
      const reconciled = orders.map(order => {
        const result = byId.get(order.id);
        if (!result || !['cancelled', 'replayed', 'unavailable', 'ineligible'].includes(result.status)) {
          throw new Error('The service returned an unexpected result.');
        }
        return { order, result };
      });
      try { sessionStorage.removeItem(storageKey); } catch { /* The current form still clears the confirmed operation. */ }
      setAttempt(null);
      setReason('');
      setResults(reconciled);
      onConfirmed(rows.filter(row => row.status === 'cancelled' || row.status === 'replayed').map(row => row.id));
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : 'The order service did not confirm the batch.';
      setIssue(detail + ' Retry with the original reason to check the same operation.');
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return <>
    {(attempt || selection.length > 0) && <section className="padded" aria-label="Batch cancellation">
      {attempt && <p>Check the previous cancellation for {attempt.orders.map(order => order.label).join(', ')}.</p>}
      <form className="page-actions" method="post" onSubmit={cancelSelected}>
        <label>Cancellation reason<input required maxLength={500} value={reason} disabled={!ready || busy} onChange={e => setReason(e.target.value)}/></label>
        <button className="button secondary" disabled={!ready || busy}>
          {busy ? 'Checking…' : attempt ? 'Recover cancellation results' : 'Cancel selected orders'}
        </button>
      </form>
      {issue && <p role="alert">{issue}</p>}
    </section>}
    {results.length > 0 && <ul className="notice" aria-label="Cancellation results">{results.map(({ order, result }) => <li key={order.id}>
      {order.label} · {result.status === 'replayed' ? 'Already cancelled by this operation' : result.message ?? statusLabel(result.status)}
    </li>)}</ul>}
  </>;
}
