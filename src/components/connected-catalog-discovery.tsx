import Link from 'next/link';
import { ApiError, type Session } from '@/lib/api';
import { connectedCatalog, mayEditConnectedTaxonomy } from '@/lib/connected-catalog';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { DeviceModelForm, SearchMaintenanceActions, type SearchStatus } from './connected-catalog-discovery-actions';
import type { ApprovedDeviceSearch } from './connected-catalog-product/contracts';
import { approvedDevicePath } from './connected-catalog-product/routes';
import { TaxonomyPendingChanges } from './connected-catalog-product/taxonomy-controls';
import './connected-catalog-product/catalog-layout.css';

type Props = { auth: Session; region: Region };
type DeviceDetails = { device: ApprovedDeviceSearch['matches'][number]; history: {
  id: string; createdAt: string; actor: { name: string } | null;
}[] };
const formatDate = (date: string) => new Intl.DateTimeFormat('en', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
}).format(new Date(date));

export async function ApprovedDevicesWorkspace({ auth, region, q }: Props & { q: Query }) {
  const search = param(q, 'q')?.trim().slice(0, 100) ?? '';
  const modelId = param(q, 'model');
  const canEdit = mayEditConnectedTaxonomy(auth);
  const creating = canEdit && param(q, 'create') === '1';
  const [list, selected] = await Promise.all([
    connectedCatalog<ApprovedDeviceSearch>(auth, region, { read: 'devices', q: search }),
    !creating && modelId && /^[a-z0-9][a-z0-9-]{0,79}$/.test(modelId)
      ? connectedCatalog<DeviceDetails>(auth, region, { read: 'device', id: modelId }).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }) : null,
  ]);
  const href = (selection: Record<string, string>) => `${approvedDevicePath}?${new URLSearchParams({ region, q: search, ...selection })}`;
  return <TaxonomyPendingChanges><div className="taxonomy-workspace">
    <PageHeading eyebrow="COMMERCE / PRODUCTS" title="Approved device models"
      description="Manage shared device identities and the approved aliases customers can search. Product fitment still links to a physical variant." />
    <section className="taxonomy-card" aria-labelledby="device-directory">
      <div className="taxonomy-card-heading"><h2 id="device-directory">Device directory</h2>
        {canEdit && <Link className="taxonomy-button" href={href({ create: '1' })}>Add a device model</Link>}
      </div>
      <form method="get" action={adminPath(approvedDevicePath)} className="taxonomy-search">
        <input type="hidden" name="region" value={region} />
        <label>Device model search <input type="search" name="q" maxLength={100} defaultValue={search} /></label>
        <button className="taxonomy-button" type="submit">Search models</button>
      </form>
      {list.matches.length ? <div className="table-scroll"><table className="taxonomy-table" aria-label="Approved device models">
        <thead><tr><th scope="col">Brand and model</th><th scope="col">Approved aliases</th><th scope="col">Manage</th></tr></thead>
        <tbody>{list.matches.map(device => <tr key={device.id}>
          <th scope="row">{device.brand} {device.name}</th>
          <td>{device.aliases.map(({ label }) => label).join(', ') || 'None'}</td>
          <td><Link className="table-link" href={href({ model: device.id })}>{canEdit ? 'Edit' : 'View'} {device.name}</Link></td>
        </tr>)}</tbody>
      </table></div> : <p className="taxonomy-muted">{search ? 'No approved device models match this search.' : 'No device models have been approved.'}</p>}
      {list.hasMore && <p className="taxonomy-muted">Showing the first 20 matches. Narrow your search to find more models.</p>}
    </section>
    {modelId && !selected && !creating && <p className="taxonomy-error" role="status">The selected device model could not be found.</p>}
    {(creating || selected) && <section className="taxonomy-card" aria-labelledby="device-details">
      <div className="taxonomy-card-heading">
        <h2 id="device-details">{selected ? `${selected.device.brand} ${selected.device.name}` : 'Add a device model'}</h2>
        <Link className="taxonomy-button" href={href({})}>Close model details</Link>
      </div>
      {canEdit ? <DeviceModelForm key={selected ? `${selected.device.id}:${selected.device.revision}` : 'new'}
        device={selected?.device} region={region} query={search} /> : selected && <p>Aliases: {selected.device.aliases.map(row => row.label).join(', ') || 'None'}</p>}
      {selected && <div><h3>Device change history</h3>
        {selected.history.length ? <ul className="taxonomy-choice-list">{selected.history.map(row => <li key={row.id}>
          {formatDate(row.createdAt)} UTC · {row.actor?.name ?? 'Former staff member'} updated the model
        </li>)}</ul> : <p className="taxonomy-muted">No device changes have been recorded.</p>}
      </div>}
    </section>}
  </div></TaxonomyPendingChanges>;
}

const indexStates = { ready: 'Ready', review: 'Needs review', missing: 'Missing table' };
const probeStates = { matched: 'Matched', no_public_variant: 'No public variant', mismatch: 'Needs review' };

export async function CatalogSearchMaintenanceWorkspace({ auth, region }: Props) {
  const data = await connectedCatalog<SearchStatus>(auth, region, { read: 'search-status' });
  return <div className="taxonomy-workspace">
    <PageHeading eyebrow="CONTENT / SEARCH" title="Catalog search maintenance"
      description="Inspect the catalog’s PostgreSQL indexes and verify that public search resolves a published SKU to the exact variant and offer." />
    <section className="taxonomy-card" aria-labelledby="search-actions">
      <h2 id="search-actions">Search operations</h2>
      <p>Reconciliation uses {data.marketName} · {data.locale}. Index health and rebuilds cover the shared catalog.</p>
      <SearchMaintenanceActions region={region} canWrite={mayEditConnectedTaxonomy(auth)} canRebuild={data.canRebuild} />
    </section>
    <section className="taxonomy-card" aria-labelledby="search-index-status">
      <h2 id="search-index-status">Native index status</h2>
      <div className="table-scroll"><table className="taxonomy-table">
        <thead><tr><th scope="col">Catalog relation</th><th scope="col">Indexes</th><th scope="col">Usable</th><th scope="col">Status</th></tr></thead>
        <tbody>{data.tables.map(row => <tr key={row.table}>
          <th scope="row">{row.table}</th><td>{row.indexes}</td><td>{row.usable}</td><td>{indexStates[row.state]}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="taxonomy-card" aria-labelledby="search-history">
      <h2 id="search-history">Search maintenance history</h2>
      {data.history.length ? <div className="table-scroll"><table className="taxonomy-table">
        <thead><tr><th scope="col">Run</th><th scope="col">Completed (UTC)</th><th scope="col">Staff member</th><th scope="col">Result</th></tr></thead>
        <tbody>{data.history.map(row => <tr key={row.id}>
          <th scope="row">{row.changes.operation === 'rebuild' ? 'Shared index rebuild' : 'Search reconciliation'}</th>
          <td>{formatDate(row.createdAt)}</td><td>{row.actor?.name ?? 'Former staff member'}</td>
          <td>{row.changes.operation === 'rebuild' ? `${row.changes.rebuiltTables} relations rebuilt` :
            <>{row.changes.publicParents} public products · {row.changes.checkedCards} checked · {row.changes.durationMs} ms
              <br />Exact SKU: {probeStates[row.changes.exactProbe]} · {row.changes.status === 'ok' ? 'Passed' : 'Needs review'}</>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="taxonomy-muted">No maintenance runs have been recorded for this scope.</p>}
    </section>
  </div>;
}
