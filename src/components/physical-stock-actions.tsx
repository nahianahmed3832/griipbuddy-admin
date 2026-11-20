'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { StockDetail } from '@/lib/physical-stock';
import styles from './physical-stock.module.css';

export function PhysicalStockActions({ detail, scope, canThreshold, canDamage }: {
  detail: StockDetail; scope: string; canThreshold: boolean; canDamage: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean }>();
  const pending = useRef(false);
  const attempt = useRef<{ body: string; key: string }>(null);
  const site = adminPath('/api/physical-stock?' + scope);
  const eligibleLots = detail.lots.filter(row => row.quantity > 0);

  async function save(event: FormEvent<HTMLFormElement>, method: 'PUT' | 'POST') {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const scanned = field('barcodes').split(/\s+/).filter(Boolean);
    const body = JSON.stringify(method === 'PUT'
      ? { threshold: field('threshold') === '' ? null : Number(field('threshold')), revision: detail.stock.thresholdRevision }
      : { quantity: Number(field('quantity')), reason: field('reason'), lot: field('lot'), ...(scanned.length && { barcodes: scanned }) });
    pending.current = true;
    setWorking(true);
    setNote(undefined);
    try {
      if (method === 'POST' && attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
      const response = await fetch(site, { method, body, headers: { 'Content-Type': 'application/json',
        ...(method === 'POST' && attempt.current && { 'Idempotency-Key': attempt.current.key }) } });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || 'The change could not be posted.');
      if (method === 'POST') attempt.current = null;
      setNote({ text: method === 'POST' ? 'Damage posted to inventory history.' : 'Threshold saved.', error: false });
      router.refresh();
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : 'The change could not be posted.', error: true });
    } finally { pending.current = false; setWorking(false); }
  }

  return <div className={styles.actions}>
    {canThreshold && <form aria-label="Set reorder threshold" onSubmit={event => void save(event, 'PUT')} className={`panel ${styles.card}`}>
      <h2>Reorder threshold</h2>
      <p className="muted">Flag this SKU when warehouse-usable units are at or below the threshold. Leave blank to clear it.</p>
      <div className={styles.fields}><label>Warning units<input key={detail.stock.thresholdRevision} name="threshold" type="number" min="0" max="100000" step="1"
        defaultValue={detail.stock.threshold ?? ''}/></label><button className="button primary" disabled={working}>Save threshold</button></div>
    </form>}
    {canDamage && eligibleLots.length > 0 && <form aria-label="Record warehouse damage" onSubmit={event => void save(event, 'POST')} className={`panel ${styles.card}`}>
      <h2>Record damage or write-off</h2>
      <p className="muted">Select the physical lot. Reserved units cannot be written off. Scan the affected barcodes for tracked stock.</p>
      <div className={styles.fields}>
        <label>Stock lot<select name="lot" defaultValue="" required><option value="">Choose a lot</option>{eligibleLots.map(lot =>
          <option key={lot.id} value={lot.id}>{lot.number} · {lot.quantity} units</option>)}</select></label>
        <label>Damaged units<input name="quantity" type="number" min="1" max="1000000" step="1" required/></label>
        <label>Reason<input name="reason" maxLength={240} required/></label>
        <label>Scanned barcodes<textarea name="barcodes" rows={2} maxLength={6000}/></label>
      </div>
      <button className="button primary" disabled={working}>Post damage</button>
    </form>}
    {note && <p role={note.error ? 'alert' : 'status'} className={note.error ? 'notice warn' : 'notice'}>{note.text}</p>}
  </div>;
}
