import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { url } from '@/lib/api';
import { customerStatus, customerStatuses, customerTypes, type Customer } from '@/lib/customers';
import type { Region } from '@/lib/sections';
import { ProductionCustomerActions } from './production-customer-actions';
import { WorkspaceEmpty, WorkspaceHeading, WorkspaceStatus } from './workspace-screen';
import styles from './production-customers.module.css';

export const productionCustomersPath = '/dashboard/customers';

const date = (value: string | undefined, region: Region) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString('en-US', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export function ProductionCustomers({ rows, total, page, summary, filter, region, limit, canExport, canChangePassword, canSeeOrders, children }: {
  rows: Customer[]; total: number; page: number; summary: { all: number; active: number; inactive: number; unverified: number };
  filter: Record<string, string | undefined>; region: Region; limit?: string; canExport: boolean;
  canChangePassword: boolean; canSeeOrders: boolean; children: React.ReactNode;
}) {
  const values = [
    ['Accounts in directory', summary.all], ['Active accounts', summary.active],
    ['Inactive accounts', summary.inactive], ['Unverified phones', summary.unverified],
  ] as const;
  const columns = ['Customer', 'Status', 'Account type', ...(canSeeOrders ? ['Orders', 'Completed', 'Cancelled'] : []),
    'Joined', 'Updated', ...(canChangePassword ? ['Actions'] : [])];
  const exportUrl = adminPath(url('/api/customers', { ...filter, region, view: 'production' }));
  return <section className={styles.page}>
    <WorkspaceHeading title="All Customers" detail={`Shared account directory · Order counts scoped to ${region === 'BD' ? 'Bangladesh' : 'International'}`}>
        {canExport && (total > 0 ? <a className="button secondary" href={exportUrl} download><Download size={17} aria-hidden="true"/> Download Excel</a>
          : <button className="button secondary" type="button" disabled><Download size={17}/> Download Excel</button>)}
    </WorkspaceHeading>
    <dl className={styles.summary} aria-label="Shared directory totals">
      {values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value.toLocaleString('en-US')}</dd></div>)}
    </dl>
    <form className={styles.filters} action={adminPath(productionCustomersPath)} key={JSON.stringify(filter)} aria-label="Customer filters">
      <input type="hidden" name="region" value={region}/>
      {limit && <input type="hidden" name="limit" value={limit}/>}
      <label className={styles.search}>Search customers<input type="search" name="q" placeholder="Name, phone or email" maxLength={100} defaultValue={filter.q}/></label>
      <label>Status<select name="status" defaultValue={filter.status ?? ''}>
        <option value="">Any status</option>{customerStatuses.map(status => <option key={status} value={status}>{customerStatus(status)}</option>)}
      </select></label>
      <label>Account type<select name="type" defaultValue={filter.type ?? ''}>
        <option value="">Any type</option>{customerTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Phone verification<select name="verification" defaultValue={filter.verification ?? ''}>
        <option value="">Any verification</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
      </select></label>
      <label>Sort<select name="sort" defaultValue={filter.sort ?? ''}>
        <option value="">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
      </select></label>
      <div className={styles.filterActions}><button className="button primary"><Search size={15} aria-hidden="true"/> Apply filters</button>
        {Object.values(filter).some(Boolean) && <Link className="button secondary" href={url(productionCustomersPath, { region, limit })}>Clear</Link>}
      </div>
    </form>
    <p className={styles.matchCount}>{total.toLocaleString('en-US')} {total === 1 ? 'matching account' : 'matching accounts'}</p>
    <div className={styles.table} role="region" aria-label="Customer accounts" tabIndex={0}>
      <table aria-label="All customers" role="table">
        <thead role="rowgroup"><tr role="row">{columns.map(column => <th key={column} scope="col" role="columnheader">{column}</th>)}</tr></thead>
        <tbody role="rowgroup">{rows.map(row => <tr key={row._id} role="row">
          <th scope="row" role="rowheader"><strong>{row.full_name || 'Unnamed customer'}</strong>{row.phone_number && <small>{row.phone_number}</small>}
            {row.email && <small>{row.email}</small>}</th>
          <td role="cell" data-field="Status"><WorkspaceStatus tone={row.status === 'ACTIVE' ? 'success' : ['INACTIVE', 'BANNED', 'BLOCKED'].includes(row.status ?? '') ? 'danger' : 'neutral'}>{customerStatus(row.status)}</WorkspaceStatus></td>
          <td role="cell" data-field="Account type">{row.userType || '—'}</td>
          {canSeeOrders && <>
            <td role="cell" data-field="Orders">{row.orderCount ?? '—'}</td>
            <td role="cell" data-field="Completed">{row.completedOrders ?? '—'}</td>
            <td role="cell" data-field="Cancelled">{row.cancelledOrders ?? '—'}</td>
          </>}
          <td role="cell" data-field="Joined">{date(row.createdAt, region)}</td>
          <td role="cell" data-field="Updated">{date(row.updatedAt, region)}</td>
          {canChangePassword && <td role="cell" className={styles.rowAction}><ProductionCustomerActions name={row.full_name || 'customer'}
            passwordPath={url('/dashboard/password-change-customer/' + row._id, { ...filter, region, limit, page: String(page) })}/></td>}
        </tr>)}
        {!rows.length && <tr role="row"><td className={styles.emptyRow} role="cell" colSpan={columns.length}><WorkspaceEmpty title="No matching accounts" detail="Change your search or filters."/></td></tr>}</tbody>
      </table>
    </div>
    {children}
  </section>;
}
