'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { Region } from '@/lib/sections';
import type { ApprovedDeviceSearch } from './connected-catalog-product/contracts';
import { approvedDevicePath } from './connected-catalog-product/routes';
import { TaxonomyFeedback, TaxonomyForm, useTaxonomyOperation } from './connected-catalog-product/taxonomy-controls';

type RebuildHistory = { operation: 'rebuild'; rebuiltTables: number };
type ReconciliationHistory = { operation: 'reconcile'; publicParents: number; checkedCards: number; durationMs: number;
  exactProbe: 'matched' | 'no_public_variant' | 'mismatch'; status: 'ok' | 'review' };
export type SearchStatus = { locale: string; marketName: string; canRebuild: boolean;
  tables: { table: string; indexes: number; usable: number; state: 'ready' | 'review' | 'missing' }[];
  history: { id: string; createdAt: string; actor: { name: string } | null; changes: RebuildHistory | ReconciliationHistory }[];
};

export function DeviceModelForm({ device, region, query }: {
  device?: ApprovedDeviceSearch['matches'][number]; region: Region; query: string;
}) {
  const router = useRouter();
  const operation = useTaxonomyOperation();
  // Retain the issued ID if a create can be retried after its response was interrupted.
  const [createId, setCreateId] = useState<string>();
  const modelHref = (id: string) => `${approvedDevicePath}?${new URLSearchParams({ region, q: query, model: id })}`;
  return <TaxonomyForm onSubmit={async event => {
    const form = new FormData(event.currentTarget);
    const id = device?.id ?? createId ?? `device-${crypto.randomUUID()}`;
    if (!device) setCreateId(id);
    const saved = await operation.run(() => catalogRequest({ action: 'device.save', input: {
      id, revision: device?.revision ?? null, brand: form.get('brand'), name: form.get('name'),
      aliases: String(form.get('aliases') ?? '').split(/\r?\n/).map(alias => alias.trim()).filter(Boolean),
    } }, region), 'Device model saved.', { refresh: Boolean(device) });
    if (saved) {
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: 'Device model saved.' }));
      if (!device) router.push(modelHref(id));
    }
    return saved;
  }}>
    {device && <p className="taxonomy-muted">Device identity <code style={{ overflowWrap: 'anywhere' }}>{device.id}</code></p>}
    <div className="taxonomy-fields">
      <label>Brand<input name="brand" required maxLength={70} defaultValue={device?.brand} /></label>
      <label>Model name<input name="name" required maxLength={100} defaultValue={device?.name} /></label>
    </div>
    <label>Approved aliases<textarea name="aliases" rows={5} maxLength={8550}
      defaultValue={device?.aliases.map(row => row.label).join('\n')} aria-describedby="approved-aliases-help" /></label>
    <p className="taxonomy-muted" id="approved-aliases-help">Enter one approved search term per line. Use distinct terms across models.</p>
    <div className="taxonomy-actions"><button className="taxonomy-button taxonomy-button--primary" disabled={operation.pending}>
      {operation.pending ? 'Saving…' : 'Save device model'}
    </button></div>
    <TaxonomyFeedback error={operation.error} />
    {operation.error && createId && <Link href={modelHref(createId)}>Check whether the device was saved</Link>}
  </TaxonomyForm>;
}

export function SearchMaintenanceActions({ region, canWrite, canRebuild }: { region: Region; canWrite: boolean; canRebuild: boolean }) {
  const operation = useTaxonomyOperation();
  const [running, setRunning] = useState<'reconcile' | 'rebuild' | null>(null);
  async function run(mode: 'reconcile' | 'rebuild') {
    if (mode === 'rebuild' && !window.confirm('Rebuild the shared catalog indexes on this isolated test database?')) return;
    setRunning(mode);
    await operation.run(() => catalogRequest({ action: `search.${mode}`, input: {} }, region),
      mode === 'rebuild' ? 'Shared catalog indexes rebuilt.' : 'Search reconciliation completed.');
    setRunning(null);
  }
  return <>
    {canWrite && <div className="taxonomy-actions">
      <button type="button" className="taxonomy-button taxonomy-button--primary" disabled={operation.pending}
        onClick={() => void run('reconcile')}>{running === 'reconcile' ? 'Reconciling…' : 'Run search reconciliation'}</button>
      {canRebuild && <button type="button" className="taxonomy-button" disabled={operation.pending}
        onClick={() => void run('rebuild')}>{running === 'rebuild' ? 'Rebuilding…' : 'Rebuild search indexes'}</button>}
    </div>}
    {!canWrite && <p className="taxonomy-muted">Catalog update permission is required to run maintenance.</p>}
    {!canRebuild && <p className="taxonomy-muted">Index rebuilds require the disposable loopback test database.</p>}
    <TaxonomyFeedback {...operation} />
  </>;
}
