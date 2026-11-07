import Link from 'next/link';
import { ArrowLeft, ArrowRight, History, Plus, Search, Shield, Users } from 'lucide-react';
import { api, ApiError, canWrite, mongoId, staffEnrollmentAvailable, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, superAdmin } from '@/lib/sections';
import { activityPath, dateLabel, directory, endpoint, permissionInfo, roleDirectory, statusLabel,
  type Options, type Paged, type RoleRecord, type StaffEvent, type StaffRecord } from '@/lib/staff-access';
import { PageHeading } from './dashboard';
import { RoleEditor, StaffForm, StaffLifecycle } from './staff-forms';
import '@/app/staff-access.css';

const title = 'ADMINISTRATION / STAFF & ACCESS';
const eventLabels: Record<string, string> = {
  'role.created': 'Created role', 'role.updated': 'Updated role', 'role.deleted': 'Deleted role',
  'staff.created': 'Created staff account', 'staff.invited': 'Created setup link', 'staff.updated': 'Updated staff account',
  'staff.setup_completed': 'Completed setup', 'staff.suspend': 'Suspended access', 'staff.reactivate': 'Reactivated access',
  'staff.reissue': 'Replaced setup link', 'staff.cancel': 'Revoked setup link', 'staff.deleted': 'Deleted staff account', 'staff.restored': 'Restored staff account',
  'staff.permissions_updated': 'Updated individual grants', 'staff.role_assigned': 'Assigned role', 'staff.password_changed': 'Changed password',
};
function Badge({ row }: { row: StaffRecord }) {
  const expired = row.status === 'PENDING' && row.setupExpiresAt && new Date(row.setupExpiresAt).getTime() < Date.now();
  return <span className={'staff-badge ' + (row.status === 'ACTIVE' ? 'staff-active' : row.status === 'PENDING' ? 'staff-pending' : 'staff-inactive')}>
    {row.setupRevoked ? 'Setup link revoked' : expired ? 'Setup link expired' : statusLabel[row.status] || row.status}
  </span>;
}
function Pages<T>({ path, result, filters }: { path: string; result: Paged<T>; filters?: Record<string, string> }) {
  const { page, total, size } = result;
  if (total <= size && page === 1) return null;
  return <nav className="pagination" aria-label="Result pages">
    <span>Page {page} of {Math.max(1, Math.ceil(total / size))}</span>
    <div>{page > 1 && <Link className="button secondary" href={url(path, { ...filters, page: String(page - 1) })}><ArrowLeft size={15}/> Previous</Link>}
      {page * size < total && <Link className="button secondary" href={url(path, { ...filters, page: String(page + 1) })}>Next <ArrowRight size={15}/></Link>}</div>
  </nav>;
}
function Filters({ path, q, status, roles }: { path: string; q: string; status: string; roles: boolean }) {
  return <form className="staff-filters" action={adminPath(path)} key={q + '/' + status}>
    <label>Search <span className="staff-search"><Search size={16} aria-hidden="true"/><input type="search" name="q" defaultValue={q}
      placeholder={roles ? 'Role name or permission key' : 'Name, role, email or phone'} maxLength={120}/></span></label>
    {!roles && <label>Account status<select name="status" defaultValue={status}><option value="">All statuses</option>
      <option value="ACTIVE">Active</option><option value="PENDING">Pending setup</option><option value="INACTIVE">Suspended</option></select></label>}
    <button className="button secondary" type="submit">Apply filters</button>
    {(q || status) && <Link className="button subtle" href={path}>Reset</Link>}
  </form>;
}
function NoResults({ title, detail, kind }: { title: string; detail: string; kind: 'staff' | 'roles' | 'activity' }) {
  const Icon = kind === 'staff' ? Users : kind === 'roles' ? Shield : History;
  return <div className="empty"><span className="empty-icon"><Icon size={21} aria-hidden="true"/></span><h3>{title}</h3><p>{detail}</p></div>;
}

export async function StaffWorkspace({ auth, view, id, q }: { auth: Session; view: string; id?: string; q: Query }) {
  if (!superAdmin(auth.staff)) throw new ApiError(403);
  const write = canWrite(auth.staff);
  const enrollment = staffEnrollmentAvailable();
  const canInvite = write && enrollment && has(auth.staff, 'user.create');
  const search = param(q, 'q')?.slice(0, 120) ?? '';
  const status = param(q, 'status') ?? '';
  const page = param(q, 'page');
  if (view === 'activity' && !id) {
    const result = await api(url(endpoint + '/activity', { page }), auth.token) as Paged<StaffEvent>;
    return <><PageHeading eyebrow={title} title="Access activity" description="Review changes to staff accounts, assignments and role permissions."/>
      <section className="panel">
        {result.rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Access activity">
          <table><thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Changed by</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead>
            <tbody>{result.rows.map(row => <tr key={row._id}><td>{dateLabel(row.at)}</td><td>{eventLabels[row.action] ?? row.action}</td>
              <td>{row.actorName || row.actor}</td><td>{row.targetName || row.target}</td>
              <td>{row.changes?.added?.length ? <span className="staff-cell-sub">Granted: {row.changes.added.map(key => permissionInfo(key).label).join(', ')}</span> : null}
                {row.changes?.removed?.length ? <span className="staff-cell-sub">Revoked: {row.changes.removed.map(key => permissionInfo(key).label).join(', ')}</span> : null}
                {typeof row.changes?.role === 'string' ? row.changes.role : row.changes?.role && row.changes.role.from !== row.changes.role.to
                  ? `${row.changes.role.from} → ${row.changes.role.to}` : null}</td></tr>)}</tbody></table></div>
          : <NoResults kind="activity" title="No access changes recorded yet" detail="New invitations and access changes will appear here."/>}
        <Pages path={activityPath} result={result}/>
      </section></>;
  }
  if (view !== 'staff' && view !== 'roles') throw new ApiError(404);
  if (id && id !== 'new' && !mongoId(id)) throw new ApiError(404);

  if (view === 'roles' && id) {
    const create = id === 'new';
    const edit = write && has(auth.staff, create ? 'role.create' : 'role.update');
    if (create && !edit) throw new ApiError(403);
    const { catalog, role } = await api(url(endpoint + '/role-editor', { id: create ? undefined : id }), auth.token) as { catalog: string[]; role: RoleRecord | null };
    return <><PageHeading eyebrow={title} title={role?.name ?? 'Create role'}
      description="Grant the permissions staff need for this role. Review the effect before saving."/>
      <RoleEditor role={role} catalog={catalog} writable={edit} canDelete={write && has(auth.staff, 'role.delete')}/></>;
  }
  if (view === 'roles') {
    const result = await api(url(endpoint + '/roles', { page, q: search }), auth.token) as Paged<RoleRecord>;
    return <><PageHeading eyebrow={title} title="Roles and permissions" description="See who uses each role and review what it allows.">
      {write && has(auth.staff, 'role.create') && <Link className="button primary" href={roleDirectory + '/new'}><Plus size={16}/> Create role</Link>}</PageHeading>
      <section className="panel"><header className="panel-header"><div><h2>Role directory</h2><p>{result.total} {result.total === 1 ? 'role' : 'roles'}</p></div></header>
        <Filters path={roleDirectory} q={search} status="" roles/>
        {result.rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Role results"><table>
          <thead><tr><th scope="col">Role</th><th scope="col">Permissions</th><th scope="col">Assigned accounts</th></tr></thead>
          <tbody>{result.rows.map(row => <tr key={row.id}><th scope="row"><Link className="table-link" href={roleDirectory + '/' + row.id}>{row.name}</Link>
            {row.protected && <small className="staff-cell-sub muted">Protected role</small>}</th><td>{row.count}</td><td>{row.assigned}</td></tr>)}</tbody>
        </table></div> : <NoResults kind="roles" title="No roles found" detail="Try another search or create a role."/>}
        <Pages path={roleDirectory} result={result} filters={{ q: search }}/>
      </section></>;
  }
  if (id === 'new') {
    if (!canInvite) throw new ApiError(403);
    const options = await api(endpoint + '/options', auth.token) as Options;
    return <><PageHeading eyebrow={title} title="Invite staff" description="Assign a role and create a one-time link for the staff member to set their password."/>
      <StaffForm options={options} back={directory}/></>;
  }
  if (id) {
    const row = await api(endpoint + '/directory/' + id, auth.token) as StaffRecord;
    const editable = write && has(auth.staff, 'user.update') && !row.protected && row.id !== auth.staff.id;
    const options = editable ? await api(endpoint + '/options', auth.token) as Options : null;
    return <><PageHeading eyebrow={title} title={row.name} description={row.protected ? 'This super administrator account is protected.' : 'Review this staff member’s assigned role and current access.'}>
      <Link href={directory} className="button secondary"><ArrowLeft size={15}/> Back to staff</Link></PageHeading>
      <section className="panel staff-block staff-summary">
        <div><span>Account status</span><Badge row={row}/></div><div><span>Role</span><strong>{row.role}</strong></div>
        <div><span>Location</span><strong>{row.location || 'Unassigned'}</strong></div>
        {row.setupExpiresAt && !row.setupRevoked && row.status === 'PENDING' && <div><span>Setup link expires</span><strong>{dateLabel(row.setupExpiresAt)}</strong></div>}
        {!options && <><div><span>Sign-in phone</span><strong>{row.phone}</strong></div><div><span>Work email</span><strong>{row.email || '—'}</strong></div></>}
        <details className="staff-grants"><summary>{row.permissions.length} effective permissions</summary>
          <ul>{row.permissions.map(key => <li key={key}>{permissionInfo(key).label}</li>)}</ul></details>
      </section>
      {options && <><StaffForm key={row.revision ?? row.id} row={row} options={options} back={directory}/><StaffLifecycle row={row} back={directory} enrollment={enrollment}/></>}
    </>;
  }
  const result = await api(url(endpoint + '/directory', { page, q: search, status }), auth.token) as Paged<StaffRecord>;
  return <><PageHeading eyebrow={title} title="Staff directory" description="Review team access across all business locations.">
    {canInvite && <Link className="button primary" href={directory + '/new'}><Plus size={16}/> Invite staff</Link>}</PageHeading>
    <section className="panel"><header className="panel-header"><div><h2>Staff accounts</h2><p>{result.total} {result.total === 1 ? 'account' : 'accounts'}</p></div></header>
      <Filters path={directory} q={search} status={status} roles={false}/>
      {result.rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Staff results"><table>
        <thead><tr><th scope="col">Staff member</th><th scope="col">Role</th><th scope="col">Location</th><th scope="col">Status</th></tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.id}><th scope="row"><Link className="table-link" href={directory + '/' + row.id}>{row.name}</Link>
          <small className="staff-cell-sub muted">{row.email || row.phone}</small></th><td>{row.role}</td><td>{row.location || 'Unassigned'}</td><td><Badge row={row}/></td></tr>)}</tbody>
      </table></div> : <NoResults kind="staff" title="No staff accounts found" detail="Try another search or clear the filters."/>}
      <Pages path={directory} result={result} filters={{ q: search, status }}/>
    </section></>;
}
