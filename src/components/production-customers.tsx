import { Download } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { url } from '@/lib/api';
import type { Customer } from '@/lib/customers';
import { ProductionCustomerActions, ProductionCustomerSearch } from './production-customer-actions';
import styles from './production-customers.module.css';

export const productionCustomersPath = '/dashboard/customers';

const columns = ['Sl No:', 'Name', 'Total Orders', 'Completed Orders', 'Cancelled Orders', 'Status', 'User Type', 'Joined Date', 'Last Updated', 'Actions'];
const date = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

export function ProductionCustomers({ rows, total, page, size, query, region, limit, canExport, canChangePassword, canSeeOrders, children }: {
  rows: Customer[]; total: number; page: number; size: number; query?: string; region: string; limit?: string; canExport: boolean;
  canChangePassword: boolean; canSeeOrders: boolean; children: React.ReactNode;
}) {
  const values = [
    ['Total Customers', total], ['Active', rows.filter(row => row.status === 'ACTIVE').length],
    ['Inactive', rows.filter(row => row.status === 'INACTIVE').length], ['Total Orders', canSeeOrders ? rows.reduce((sum, row) => sum + (row.orderCount ?? 0), 0) : '—'],
    ['POS Users', rows.filter(row => row.userType === 'POS').length], ['APP Users', rows.filter(row => row.userType === 'APP').length],
  ];
  const exportUrl = adminPath(url('/api/customers', { q: query, region, view: 'production' }));
  return <section className={styles.page}>
    <header className={styles.heading}>
      <h1>All Customers</h1>
      <div>
        <ProductionCustomerSearch query={query ?? ''} region={region} limit={limit}/>
        {canExport && (total > 0 ? <a className="button secondary" href={exportUrl} download><Download size={17}/> Download Excel</a>
          : <button className="button secondary" type="button" disabled><Download size={17}/> Download Excel</button>)}
      </div>
    </header>
    <dl className={styles.summary}>
      {values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value.toLocaleString('en-US')}</dd></div>)}
    </dl>
    <div className={styles.table} role="region" aria-label="Customer accounts" tabIndex={0}>
      <table aria-label="All customers">
        <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row._id}>
          <td>{(page - 1) * size + index + 1}</td>
          <th scope="row"><strong>{row.full_name || 'Unnamed customer'}</strong>{row.phone_number && <small>{row.phone_number}</small>}
            {row.email && <small>{row.email}</small>}</th>
          <td>{canSeeOrders ? row.orderCount ?? 0 : '—'}</td><td>{canSeeOrders ? row.completedOrders ?? 0 : '—'}</td>
          <td>{canSeeOrders ? row.cancelledOrders ?? 0 : '—'}</td>
          <td><span className={styles.badge} data-value={row.status}>{row.status || 'Unknown'}</span></td>
          <td>{row.userType || '—'}</td>
          <td>{date(row.createdAt)}</td><td>{date(row.updatedAt)}</td>
          <td><ProductionCustomerActions name={row.full_name || 'customer'}
            passwordPath={canChangePassword
              ? url('/dashboard/password-change-customer/' + row._id, { q: query, region, limit, page: String(page) }) : undefined}/></td>
        </tr>)}
        {!rows.length && <tr><td colSpan={columns.length}>No customers found.</td></tr>}</tbody>
      </table>
    </div>
    {children}
  </section>;
}
