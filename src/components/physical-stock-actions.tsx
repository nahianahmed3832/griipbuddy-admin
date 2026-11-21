'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { StockDetail } from '@/lib/physical-stock';
import styles from './physical-stock.module.css';

type DamageAttempt = { digest: string; key: string };
const subscribe = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

export function PhysicalStockActions({ detail, scope, canThreshold, canDamage }: {
  detail: StockDetail; scope: string; canThreshold: boolean; canDamage: boolean;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean }>();
  const pending = useRef(false);
  const attempt = useRef<DamageAttempt>(null);
  const attemptStorage = 'physical-stock-damage:' + scope;
  const site = adminPath('/api/physical-stock?' + scope);
  const eligibleLots = detail.lots.filter(row => row.usable ?? (
    row.status === 'active' && row.quantity > 0 && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now())
  ));

  async function save(event: FormEvent<HTMLFormElement>, method: 'PUT' | 'POST') {
    event.preventDefault();
    if (pending.current) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const scanned = field('barcodes').split(/\s+/).filter(Boolean).sort();
    const body = JSON.stringify(method === 'PUT'
      ? { threshold: field('threshold') === '' ? null : Number(field('threshold')), revision: detail.stock.thresholdRevision }
      : { quantity: Number(field('quantity')), reason: field('reason'), lot: field('lot'), ...(scanned.length && { barcodes: scanned }) });
    pending.current = true;
    setWorking(true);
    setNote(undefined);
    try {
      if (method === 'POST') {
        const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
        const digest = Array.from(new Uint8Array(checksum), byte => byte.toString(16).padStart(2, '0')).join('');
        try {
          if (!attempt.current) attempt.current = JSON.parse(sessionStorage.getItem(attemptStorage) ?? 'null') as DamageAttempt | null;
        } catch { /* The current form still retains the retry key without session storage. */ }
        if (attempt.current?.digest !== digest) attempt.current = { digest, key: crypto.randomUUID() };
        try { sessionStorage.setItem(attemptStorage, JSON.stringify(attempt.current)); } catch { /* Use the in-memory retry key. */ }
      }
      const response = await fetch(site, { method, body, headers: { 'Content-Type': 'application/json',
        ...(method === 'POST' && attempt.current && { 'Idempotency-Key': attempt.current.key }) } });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || 'The change could not be posted.');
      if (method === 'POST') {
        attempt.current = null;
        try { sessionStorage.removeItem(attemptStorage); } catch { /* The acknowledged form is cleared below. */ }
        element.reset();
      }
      setNote({ text: method === 'POST' ? 'Damage posted to inventory history.' : 'Threshold saved.', error: false });
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The change could not be posted.';
      setNote({ text: method === 'POST' ? text + ' If the result is uncertain, retry with the same details.' : text, error: true });
    } finally { pending.current = false; setWorking(false); }
  }

  return <div className={styles.actions}>
    {canThreshold && <form aria-label="Set reorder threshold" onSubmit={event => void save(event, 'PUT')} className={`panel ${styles.card}`}>
      <h2>Reorder threshold</h2>
      <p className="muted">Flag this SKU when warehouse-usable units are at or below the threshold. Leave blank to clear it.</p>
      <fieldset className={styles.fields} disabled={!ready || working}>
        <label>Warning units<input key={detail.stock.thresholdRevision} name="threshold" type="number" min="0" max="100000" step="1"
          defaultValue={detail.stock.threshold ?? ''}/></label>
        <button className="button primary">Save threshold</button>
      </fieldset>
    </form>}
    {canDamage && eligibleLots.length > 0 && <form aria-label="Record warehouse damage" onSubmit={event => void save(event, 'POST')} className={`panel ${styles.card}`}>
      <h2>Record damage or write-off</h2>
      <p className="muted">Select the physical lot. Reserved units cannot be written off. Scan the affected barcodes for tracked stock.</p>
      <fieldset className={styles.fields} disabled={!ready || working}>
        <label>Stock lot<select name="lot" defaultValue="" required><option value="">Choose a lot</option>{eligibleLots.map(lot =>
          <option key={lot.id} value={lot.id}>{lot.number} · {lot.quantity} units</option>)}</select></label>
        <label>Damaged units<input name="quantity" type="number" min="1" max="100000" step="1" required/></label>
        <label>Reason<input name="reason" minLength={8} maxLength={800} required/></label>
        <label>Scanned barcodes<textarea name="barcodes" rows={2} maxLength={6000}/></label>
      </fieldset>
      <button className="button primary" disabled={!ready || working}>Post damage</button>
    </form>}
    {note && <p role={note.error ? 'alert' : 'status'} className={note.error ? 'notice warn' : 'notice'}>{note.text}</p>}
  </div>;
}
