'use client';

import { useState, type FormEvent } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { Region } from '@/lib/sections';
import { WorkspaceHeading } from './workspace-screen';
import styles from './seller-listing-review.module.css';

type Kind = 'products' | 'categories';
type Preview = { issues: { row: number; message: string }[]; entries: { key: string; name: string; rows: number[]; status: string }[]; token?: string };
type Outcome = { results: { key: string; rows: number[]; status: string; message?: string }[] };

export function CatalogExchangeWorkspace({ region, canImport }: { region: Region; canImport: boolean }) {
  const [kind, setKind] = useState<Kind>('products');
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function process(operation: () => Promise<void>) {
    setError('');
    setPending(true);
    try { await operation(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The exchange did not finish. Try again.'); }
    finally { setPending(false); }
  }

  async function download(mode: 'template' | 'export') {
    await process(async () => {
      const data = await catalogRequest<{ csv: string; hasNext: boolean }>(
        { read: 'catalog-exchange', kind, mode, ...(mode === 'export' && { page }) }, region);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `griipbuddy-${kind}-${mode === 'template' ? mode : page}.csv`;
      link.click();
      const blob = link.href;
      window.setTimeout(() => URL.revokeObjectURL(blob), 1000);
      if (mode === 'export') setMore(data.hasNext);
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    await process(async () => {
      if (file.size > 131072) throw new Error('Choose a CSV up to 128 KB.');
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (preview?.token) {
        const result = await catalogRequest<Outcome>({ action: 'catalog.exchange.apply', input: { csv, kind, token: preview.token } }, region);
        setOutcome(result);
        setPreview(undefined);
      } else {
        setOutcome(undefined);
        setPreview(await catalogRequest<Preview>({ action: 'catalog.exchange.preview', input: { csv, kind } }, region));
      }
    });
  }

  return <div className={styles.workspace}>
    <WorkspaceHeading title="Catalog exchange" detail="Platform catalog · CSV import and export"/>
    <section className={`panel ${styles.card}`} aria-label="CSV export">
      <label>Record type <select value={kind} disabled={pending} onChange={event => {
        setKind(event.target.value === 'categories' ? 'categories' : 'products'); setPage(1); setMore(true);
        setFile(undefined); setPreview(undefined); setOutcome(undefined); setError('');
      }}><option value="products">Products and SKUs</option><option value="categories">Category hierarchy</option></select></label>
      <p className="muted">Product imports create platform drafts. Rows with existing IDs are skipped. Set offers in the product editor.</p>
      <div className="filters">
        <button type="button" className="button secondary" disabled={pending} onClick={() => void download('template')}>Download template</button>
        <label>Export page <input type="number" min={1} max={10000} value={page} disabled={pending}
          onChange={event => { setPage(Math.min(10000, Math.max(1, Number(event.target.value)))); setMore(true); }}/></label>
        <button type="button" className="button secondary" disabled={pending} onClick={() => void download('export')}>Download export</button>
      </div>
      {!more && <p role="status" className="muted">End of available export rows on this page.</p>}
    </section>
    {canImport && <section className={`panel ${styles.card}`} aria-label="CSV import">
      <h2>Import {kind}</h2>
      <p className="muted">Use UTF-8, up to 150 rows. Use one row per SKU or category. Review every row before importing.</p>
      <form onSubmit={submit} className="filters" key={kind}>
        <label>CSV file<input type="file" accept=".csv,text/csv" required disabled={pending} onChange={event => {
          setFile(event.target.files?.[0]); setPreview(undefined); setOutcome(undefined); setError('');
        }}/></label>
        <button type="submit" className="button primary" disabled={!file || pending}>
          {pending ? 'Working…' : preview?.token ? 'Import reviewed file' : 'Preview file'}
        </button>
      </form>
      {preview && <div aria-live="polite"><h3>Preview results</h3>
        {preview.issues.length > 0 && <ul className="notice warn" role="alert">{preview.issues.map((issue, i) =>
          <li key={i}>Row {issue.row} · {issue.message}</li>)}</ul>}
        <ul>{preview.entries.map(row => <li key={row.key}>{row.name} · {row.status} · Rows {row.rows.join(', ')}</li>)}</ul>
      </div>}
      {outcome && <div aria-live="polite"><h3>Import results</h3><ul>{outcome.results.map(row =>
        <li key={row.key}>{row.key} · {row.status} · Rows {row.rows.join(', ')}{row.message && ` · ${row.message}`}</li>)}</ul></div>}
    </section>}
    {error && <p role="alert" className="notice warn">{error}</p>}
  </div>;
}
