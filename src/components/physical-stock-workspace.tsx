import Link from 'next/link';
import { ArrowLeft, Download, Search } from 'lucide-react';
import { ApiError, type Session, url, workspaceWritesEnabled } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { mayReadPhysicalStock, physicalLocations, physicalStockDetail, physicalStockFilters, physicalStocks, recoveredStockPage } from '@/lib/physical-stock';
import { has, type Region } from '@/lib/sections';
import { PhysicalStockActions } from './physical-stock-actions';
import { WorkspaceEmpty, WorkspaceHeading, WorkspaceStatus } from './workspace-screen';
import styles from './physical-stock.module.css';

const statuses = [['low', 'At or below threshold'], ['available', 'Has usable stock'], ['unavailable', 'Has unavailable units']];
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : '—';

export async function PhysicalStockWorkspace({ auth, region, q, production }: { auth: Session; region: Region; q: Query; production: boolean }) {
  if (!mayReadPhysicalStock(auth)) throw new ApiError(403);
  const filters = physicalStockFilters(name => param(q, name), region);
  const path = production ? recoveredStockPage : '/desk/inventory/physical-stock';
  const { locations } = await physicalLocations(auth, region, filters.market);
  const location = locations.find(item => item.id === filters.location) ?? (!filters.location && locations.length === 1 ? locations[0] : undefined);
  if (filters.location && !location) throw new ApiError(403, 'This warehouse is outside the current location scope.');
  const scope = { ...filters, location: location?.id };
  const stockId = param(q, 'stock');
  const market = filters.market ?? (region === 'BD' ? 'BD' : 'International');
  if (stockId && location) {
    const detail = await physicalStockDetail(auth, stockId, scope);
    const { stock, lots, movements } = detail;
    const writable = workspaceWritesEnabled();
    const canSeeCost = has(auth.staff, 'purchase.price.view') && lots.some(row => row.unitCost !== undefined);
    const operationScope = new URLSearchParams({ region, location: location.id, ...(filters.market && { market: filters.market }), id: stock.id }).toString();
    return <div className={styles.workspace}>
      <WorkspaceHeading title={stock.sku ?? "Historical stock"} detail={`${stock.name} · ${location.name} · ${market}`}>
        <Link className="button secondary" href={url(path, { ...scope })}><ArrowLeft size={16} aria-hidden="true"/> Back to stock</Link>
      </WorkspaceHeading>
      <dl className={styles.metrics}>
        <div><dt>On hand</dt><dd>{stock.onHand}</dd></div><div><dt>Unavailable</dt><dd>{stock.unavailable}</dd></div>
        <div><dt>Warehouse usable</dt><dd>{stock.usable}</dd></div><div><dt>Threshold</dt><dd>{stock.threshold ?? '—'}</dd></div>
      </dl>
      {stock.pool && <section className={`panel ${styles.card}`} aria-label="Shared SKU pool">
        <h2>Shared SKU pool</h2><p className="muted">These totals and holds apply across warehouses for this recovered variant.</p>
        <p>{stock.pool.onHand} on hand · {stock.pool.reserved} reserved · {stock.pool.available} available</p>
      </section>}
      <PhysicalStockActions detail={detail} scope={operationScope} canThreshold={writable && has(auth.staff, 'stock.update')}
        canDamage={writable && has(auth.staff, 'stock.create')}/>
      <section className={`panel ${styles.card}`} aria-labelledby="warehouse-lots">
        <h2 id="warehouse-lots">Lots and bins</h2>
        {lots.length ? <div className={styles.table} role="region" tabIndex={0} aria-labelledby="warehouse-lots"><table>
          <thead><tr>{['Lot', 'Bin ID', 'Units', 'Status', 'Expires', ...(canSeeCost ? ['Recorded unit cost'] : [])].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
          <tbody>{lots.map(lot => <tr key={lot.id}><th scope="row">{lot.number}</th><td>{lot.bin ?? '—'}</td><td>{lot.quantity}</td>
            <td>{lot.status}</td><td>{date(lot.expiresAt)}</td>{canSeeCost && <td>{lot.unitCost ?? '—'}</td>}</tr>)}</tbody>
        </table></div> : <WorkspaceEmpty title="No lots recorded for this stock row"/>}
      </section>
      <section className={`panel ${styles.card}`} aria-labelledby="movement-history">
        <h2 id="movement-history">Movement history</h2>
        {movements.length ? <ol className={styles.history}>{movements.map(move => <li key={move.id}>
          <div><strong>{move.type?.replaceAll('_', ' ') ?? 'Historical movement'}</strong><span>{move.quantity == null ? "Quantity unavailable" : `${move.quantity} units`} · {date(move.at)}</span></div>
          <p>{move.reason || move.reference || 'Recorded stock movement'}</p>
          {move.lot && <small>Lot ID {move.lot}</small>}
        </li>)}</ol> : <WorkspaceEmpty title="No movement history for this row"/>}
      </section>
    </div>;
  }
  const result = location ? await physicalStocks(auth, scope) : null;
  return <div className={styles.workspace}>
    <WorkspaceHeading title="Physical warehouse stock" detail={`${market} · Recovered inventory`}>
      {location && <a className="button secondary" href={adminPath(url('/api/physical-stock', { ...scope, after: undefined }))} download>
        <Download size={16} aria-hidden="true"/> Export CSV</a>}
    </WorkspaceHeading>
    <section className={`panel ${styles.card}`} aria-label="Warehouse filters">
      <form className={styles.fields} action={adminPath(path)} method="get">
        <input type="hidden" name="region" value={region}/>
        {filters.market && <input type="hidden" name="market" value={filters.market}/>}
        <label>Warehouse<select name="location" defaultValue={location?.id ?? ''} required><option value="">Choose a warehouse</option>
          {locations.map(item => <option key={item.id} value={item.id}>{item.name}{item.country ? ` · ${item.country}` : ''}</option>)}</select></label>
        <label>Product name or exact SKU<input type="search" name="q" maxLength={100} defaultValue={filters.q}/></label>
        <label>Status<select name="status" defaultValue={filters.status ?? ''}><option value="">All stock</option>
          {statuses.map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label>
        <button className="button primary" type="submit"><Search size={16} aria-hidden="true"/> Apply filters</button>
      </form>
    </section>
    <section className={`panel ${styles.card}`} aria-labelledby="warehouse-stock">
      <h2 id="warehouse-stock">{location?.name ?? 'Warehouse stock'}</h2>
      <p className="muted">Warehouse usable subtracts unavailable lots before shared holds. The shared SKU pool shows variant-wide reservations for authorized staff.</p>
      {result?.items.length ? <div className={styles.table} role="region" tabIndex={0} aria-labelledby="warehouse-stock"><table className={styles.resultTable}>
        <thead><tr>{['SKU and product', 'On hand', 'Unavailable', 'Warehouse usable', 'Threshold', 'Action'].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
        <tbody>{result.items.map(row => <tr key={row.id}>
          <th scope="row"><strong>{row.sku ?? "SKU unavailable"}</strong><small>{row.name}</small></th>
          <td data-label="On hand">{row.onHand}</td><td data-label="Unavailable">{row.unavailable}</td>
          <td data-label="Warehouse usable">{row.usable}</td><td data-label="Threshold">{row.threshold ?? '—'}
            {row.low && <WorkspaceStatus tone="warning">Low stock</WorkspaceStatus>}</td>
          <td data-label="Action"><Link className="button secondary" href={url(path, { ...scope, stock: row.id })}>View lots and movements</Link></td>
        </tr>)}</tbody>
      </table></div> : <WorkspaceEmpty title={location ? 'No matching stock' : 'Choose a warehouse'}
        detail={location ? 'Try another SKU or stock status.' : 'Select a permitted location to inspect its stock.'}/>}
      {(scope.after || result?.next) && <nav className={styles.paging} aria-label="Stock pages">
        {scope.after && <Link href={url(path, { ...scope, after: undefined })}>First page</Link>}
        {result?.next && <Link href={url(path, { ...scope, after: result.next })}>Next page</Link>}
      </nav>}
    </section>
  </div>;
}
