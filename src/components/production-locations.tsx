'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, CalendarDays, Eye, MapPin, Package, Pencil, Phone, UserRound, Warehouse } from 'lucide-react';
import { useRef, useState } from 'react';
import { adminPath } from '@/lib/paths';
import { locationsPath, type LocationRecord } from '@/lib/locations';
import type { Region } from '@/lib/sections';
import { ProductionCatalogActions } from './production-catalog-actions';
import { RegistryPageSize } from './production-registry-size';
import design from './production-catalog-details.module.css';
import styles from './production-catalog.module.css';
import formStyles from './production-product-editor.module.css';
import locationStyles from './production-locations.module.css';

export type DirectoryLocation = LocationRecord & { latitude?: number; longitude?: number; created: string };
const pageSizes = ['20', '40', '60', '80', '100', 'all'];
const href = '/dashboard/business-location/all';
const local = (path: string, region: Region, query: Record<string, string> = {}) => {
  const params = new URLSearchParams({ ...(region === 'INTERNATIONAL' && { region }), ...query });
  return path + (params.size ? '?' + params : '');
};

export function ProductionLocationDirectory({ rows, region, limit, page, total, canCreate, canEdit, canDelete }: {
  rows: DirectoryLocation[]; region: Region; limit: string; page: number; total: number;
  canCreate: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<DirectoryLocation>();
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function remove() {
    if (!target || pending.current) return;
    pending.current = true;
    setBusy(true); setIssue('');
    try {
      const result = await fetch(adminPath('/api/locations?' + new URLSearchParams({ id: target.id, region })), { method: 'DELETE' });
      if (!result.ok) throw new Error((await result.text()) || 'The location could not be deleted.');
      setTarget(undefined);
      router.refresh();
    } catch (error) { setIssue(error instanceof Error ? error.message : 'The location could not be deleted.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={styles.page}>
    <header className={styles.header}><h1>Business Locations ({total})</h1>
      {canCreate && <Link className={styles.primary} href={local('/dashboard/business-location/create', region)}>Add Business Location</Link>}
    </header>
    <div className={locationStyles.list}><table className={styles.table}>
      <thead><tr>{['Sl No.', 'Name', 'Type', 'District', 'Address', 'Manager Info', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.id}>
        <td>{String(index + 1).padStart(2, '0')}</td>
        <td><Link className="table-link" href={local(locationsPath + '/' + row.id, region)}>{row.name}</Link></td><td>{row.type}</td><td>{row.address.district || 'N/A'}</td>
        <td>{row.address.local_address || 'N/A'}</td><td>Name: {row.manager_name || 'N/A'}<br/>Phone: {row.contact_numbers.join(', ') || 'N/A'}</td>
        <td><div className={design.tableActions}>{canEdit && <Link href={local('/dashboard/business-location/edit/' + row.id, region)}
          className={styles.outline} aria-label={'Edit ' + row.name}><Pencil size={16}/></Link>}
          {canDelete && <ProductionCatalogActions label="Open menu" title="Actions">{close => <button type="button" onClick={() => {
            close(); setTarget(row); setIssue('');
          }}>Delete Location</button>}</ProductionCatalogActions>}</div></td>
      </tr>)}{!rows.length && <tr><td colSpan={7} className={styles.empty}>No data found!</td></tr>}</tbody>
    </table></div>
    <nav className={design.pages} aria-label="Location pages">
      <RegistryPageSize current={limit} choices={pageSizes} path={href} params={{ region: region === 'INTERNATIONAL' ? region : undefined }}/>
      {page > 1 ? <Link className={styles.outline} href={local(href, region, { limit, page: String(page - 1) })}>Previous</Link> : <button className={styles.outline} disabled>Previous</button>}
      {limit !== 'all' && page * Number(limit) < total ? <Link className={styles.outline} href={local(href, region, { limit, page: String(page + 1) })}>Next</Link> : <button className={styles.outline} disabled>Next</button>}
    </nav>
    {target && <dialog ref={node => { if (node && !node.open) node.showModal(); }} className={formStyles.editorDialog} aria-labelledby="location-delete-title" onClose={() => setTarget(undefined)}>
      <div className={formStyles.dialogHeading}><h3 id="location-delete-title">Delete Location</h3></div>
      <p>Are you sure you want to delete {target.name}?</p>
      <div className={formStyles.saveActions}>
        <button type="button" className={styles.outline} disabled={busy} onClick={() => setTarget(undefined)}>Cancel</button>
        <button type="button" className={formStyles.danger} disabled={busy} onClick={() => void remove()}>Delete Location</button>
      </div>
      {issue && <p className={styles.error} role="alert">{issue}</p>}
    </dialog>}
  </section>;
}

export function ProductionLocationManagement({ rows, region, canViewStock, canAdjust, canTransfer }: {
  rows: DirectoryLocation[]; region: Region; canViewStock: boolean; canAdjust: boolean; canTransfer: boolean;
}) {
  return <section className={styles.page + ' ' + locationStyles.management}>
    <header><h1>Warehouse &amp; Outlet Management</h1><p>Manage and monitor all outlet and warehouse locations and their inventory</p></header>
    {([['WAREHOUSE', 'Warehouses', 'warehouse', Warehouse], ['OUTLET', 'Outlets', 'outlet', Building2]] as const).map(([type, title, label, Icon]) => {
      const locations = rows.filter(row => row.type === type);
      return <section key={String(type)} className={locationStyles.managementGroup}>
        <h2><Icon size={22}/> Available {String(title)} ({locations.length})</h2>
        {locations.length > 0 ? <div className={locationStyles.cards}>{locations.map(row => <article key={row.id} className={locationStyles.card}>
          <header><Icon size={20}/><h3>{row.name}</h3><span className={styles.activeBadge} data-active="true">{row.type}</span></header>
          {row.address.local_address && <p><MapPin size={17}/>{[row.address.local_address, row.address.thana, row.address.district].filter(Boolean).join(', ')}</p>}
          {row.manager_name && <p><UserRound size={17}/>{row.manager_name}</p>}
          {row.contact_numbers.length > 0 && <p><Phone size={17}/>{row.contact_numbers.join(', ')}</p>}
          {row.latitude !== undefined && row.longitude !== undefined && <p>Coordinates: {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}</p>}
          {row.created && <p><CalendarDays size={14}/>Created: {new Date(row.created).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })}</p>}
          {canViewStock && <footer>
            <Link className={styles.primary} href={local('/dashboard/inventory/view/' + label, region, { [label + '_id']: row.id })}>
              <Eye size={16}/> View Inventory
            </Link>
            {type === 'WAREHOUSE' && canAdjust && <Link className={styles.outline} href={local('/dashboard/inventory/warehouse-update', region)}>
              <Package size={16}/> Adjust Stock
            </Link>}
            {type === 'OUTLET' && canTransfer && <Link className={styles.outline} href={local('/dashboard/inventory/outlet-update', region, { outlet_id: row.id })}>
              <Package size={16}/> Transfer Stock
            </Link>}
          </footer>}
        </article>)}</div> : <div className={locationStyles.card}>
          <p>No {type === 'WAREHOUSE' ? 'warehouse' : 'outlets'} found</p><p>Get started by adding your first {String(label)} location.</p>
        </div>}
      </section>;
    })}
  </section>;
}
