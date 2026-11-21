import Link from 'next/link';
import { ProductionAccessActions } from './production-access-actions';
import { staffMarketLabel, statusLabel, type RoleRecord, type StaffRecord } from '@/lib/staff-access';
import type { ReactNode } from 'react';
import styles from './production-staff-directory.module.css';

export function ProductionStaffDirectory({ rows, self, create, canUpdate, canPermissions, canDelete, children, filters }: {
  rows: StaffRecord[]; self: string; create: boolean; canUpdate: boolean; canPermissions: boolean; canDelete: boolean; children?: ReactNode; filters: ReactNode;
}) {
  return <Directory title="All Staffs" create={create && { name: 'Add New Staff', path: '/dashboard/add-new-staff' }}
    columns={['Name', 'Phone Number', 'Role', 'Market', 'Status', 'Actions']} pages={children} filters={filters} empty={!rows.length}>
    {rows.map(row => <tr key={row.id}>
      <th scope="row">{row.name} {row.id === self && <span className={styles.self}>(You)</span>}</th>
      <td>{row.phone}</td>
      <td><span className={styles.role} data-protected={row.protected}>{row.role.replaceAll('_', ' ')}</span></td>
      <td>{staffMarketLabel(row.market)}</td>
      <td>{statusLabel[row.status] ?? row.status}</td>
      <td><ProductionAccessActions kind="staff" id={row.id} name={row.name} path={'/dashboard/update-staff/' + row.id}
        edit={canUpdate && !row.protected && row.id !== self} permissions={canPermissions && !row.protected && row.id !== self}
        remove={canDelete && !row.protected && row.id !== self}/></td>
    </tr>)}
  </Directory>;
}

export function ProductionRoleDirectory({ rows, create, canEdit, canDelete, children, filters }: {
  rows: RoleRecord[]; create: boolean; canEdit: boolean; canDelete: boolean; children?: ReactNode; filters: ReactNode;
}) {
  return <Directory title="All Roles" create={create && { name: 'Add New Role', path: '/dashboard/add-new-role' }}
    columns={['Role', 'Total Permission', 'Permissions List', 'Actions']} pages={children} filters={filters} empty={!rows.length}>
    {rows.map(role => {
      const permissions = role.permissions ?? [];
      return <tr key={role.id}>
        <th scope="row">{role.name}</th>
        <td>{role.count}</td>
        <td>
          {permissions.length ? <div className={styles.permissions}>
            {permissions.slice(0, 3).map(permission => <span key={permission} title={permission}>{permission.split('.').at(-1)}</span>)}
            {permissions.length > 3 && <span className={styles.remaining} title={permissions.slice(3).join(', ')}>
              +{permissions.length - 3} more
            </span>}
          </div> : <em>{role.count ? 'Open role to view permissions' : 'No permissions'}</em>}
        </td>
        <td><ProductionAccessActions kind="role" id={role.id} name={role.name} path={'/dashboard/update-role/' + role.id}
          edit={canEdit && !role.protected && role.editable !== false}
          remove={canDelete && !role.protected && !role.builtIn && !role.assigned && role.editable !== false}/></td>
      </tr>;
    })}
  </Directory>;
}

function Directory({ title, create, columns, children, pages, filters, empty }: {
  title: string; create: { name: string; path: string } | false; columns: string[]; children: ReactNode; pages?: ReactNode; filters: ReactNode; empty: boolean;
}) {
  return <section className={styles.directory} aria-label={title}>
    <header><h1>{title}</h1>{create && <Link href={create.path}>{create.name}</Link>}</header>
    <div className={styles.panel}>
      {filters}
      {empty ? <div className="empty"><h2>No matching records</h2><p>Try another search or clear the filters.</p></div> :
      <div className={styles.scroll} tabIndex={0} role="region" aria-label={title + ' table'}>
        <table>
          <thead><tr>{columns.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>}
      {pages}
    </div>
  </section>;
}
