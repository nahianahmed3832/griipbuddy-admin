'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, Search, ShieldAlert } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { dateLabel, permissionInfo, roleDirectory, templates, type Options, type RoleRecord, type SetupLink, type StaffRecord } from '@/lib/staff-access';

async function submit(action: string, values: object, id?: string) {
  const response = await fetch(adminPath('/api/staff-access'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, values }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Could not save the change. Try again.');
  return body;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not save the change. Try again.';

function SetupReceipt({ receipt, href }: { receipt: SetupLink; href: string }) {
  const [copied, setCopied] = useState(false);
  const link = window.location.origin + adminPath('/staff-setup') + '#' + receipt.token;
  return <section className="panel staff-block" aria-labelledby="setup-link-title">
    <h2 id="setup-link-title">Setup link ready</h2>
    <p>Share this link privately with the staff member. They’ll choose their password before signing in with their phone number.</p>
    <p className="muted">It can be used once and expires {dateLabel(receipt.expiresAt)}. The link is shown only here.</p>
    <div className="staff-actions"><input aria-label="Staff setup link" value={link} readOnly onFocus={e => e.target.select()}/>
      <button className="button primary" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); }
        catch { setCopied(false); }
      }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy link'}</button>
      <Link className="button secondary" href={href}>Done</Link></div>
  </section>;
}

export function StaffForm({ row, options, back }: { row?: StaffRecord; options: Options; back: string }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(row?.roleId ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SetupLink & { id: string }>();
  const role = options.roles.find(item => item.id === roleId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await submit(row ? 'staff-edit' : 'invite', {
        full_name: data.get('name'), email: data.get('email'), role_ref: roleId,
        business_location: data.get('location') || null,
        ...(row ? { revision: row.revision } : { phone_number: data.get('phone') }),
      }, row?.id);
      if (row) { router.refresh(); router.push(back); }
      else setReceipt(result);
    } catch (err) { setError(message(err)); }
    finally { setPending(false); }
  }
  if (receipt) return <SetupReceipt receipt={receipt} href={back}/>;
  return <form onSubmit={save} className="staff-form">
    <section className="panel staff-block">
      <h2>Staff details</h2>
      <fieldset disabled={pending} className="staff-grid">
        <label>Full name<input name="name" autoComplete="off" required minLength={2} maxLength={120} defaultValue={row?.name}/></label>
        <label>Work email <small>Optional</small><input name="email" type="email" maxLength={254} defaultValue={row?.email}/></label>
        <label>Sign-in phone number<input name="phone" autoComplete="off" type="tel" inputMode="tel"
          pattern={'\\+?[0-9]{8,16}'} title="8 to 16 digits, optionally starting with +" required defaultValue={row?.phone} readOnly={Boolean(row)}/>
          <small>{row ? 'This is the account’s sign-in identifier.' : 'Use the number the staff member will enter at sign-in.'}</small></label>
      </fieldset>
    </section>
    <section className="panel staff-block">
      <h2>Role and location</h2>
      <p>Choose the role that matches the work this person needs to do.</p>
      <fieldset disabled={pending} className="staff-grid">
        <label>Role<select name="role" value={roleId} onChange={e => setRoleId(e.target.value)} required>
          <option value="">Choose a role</option>
          {row && !options.roles.some(option => option.id === row.roleId) && <option value={row.roleId}>{row.role} (current)</option>}
          {options.roles.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
        </select></label>
        <label>Assigned business location <small>Optional</small><select name="location" defaultValue={row?.locationId ?? ''}>
          <option value="">Unassigned</option>
          {row?.locationId && !options.locations.some(option => option.id === row.locationId) &&
            <option value={row.locationId}>{row.location ?? 'Current location'}</option>}
          {options.locations.map(option => <option value={option.id} key={option.id}>{option.name} ({option.region === 'BD' ? 'Bangladesh' : 'International'})</option>)}
        </select><small>Feature access comes from the role.</small></label>
      </fieldset>
      {role && <details className="staff-grants"><summary>{role.permissions.length} role permissions</summary>
        {role.permissions.length ? <ul>{role.permissions.map(key => <li key={key}>{permissionInfo(key).label}</li>)}</ul>
          : <p>No permissions are granted by this role.</p>}</details>}
      {row && roleId !== row.roleId && <p className="notice warn"><ShieldAlert size={16}/> Changing roles replaces individual grants and signs this person out.</p>}
      {!row && !options.roles.length && <p className="notice warn">Create an assignable role in Roles and permissions first.</p>}
    </section>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="staff-actions"><button className="button primary" type="submit" disabled={pending || !roleId}>
      {pending ? 'Saving…' : row ? 'Save staff details' : 'Create setup link'}</button>
      <Link href={back} className="button secondary">Cancel</Link></div>
  </form>;
}

const staffActions: Record<string, [string, string]> = {
  suspend: ['Suspend access', 'The staff member will be signed out immediately. Their account and history will be kept.'],
  reactivate: ['Reactivate access', 'The staff member will be able to sign in again using their existing password.'],
  reissue: ['Replace setup link', 'This invalidates the previous setup link and creates a new link that expires in 24 hours.'],
  cancel: ['Revoke setup link', 'The staff member cannot activate this account until you create a new setup link.'],
};
export function StaffLifecycle({ row, back, enrollment }: { row: StaffRecord; back: string; enrollment: boolean }) {
  const router = useRouter();
  const actions = row.status === 'ACTIVE' ? ['suspend'] : row.status === 'INACTIVE' ? ['reactivate']
    : row.status === 'PENDING' && row.setupExpiresAt ? [
      ...(enrollment ? ['reissue'] : []), ...(!row.setupRevoked ? ['cancel'] : []),
    ] : [];
  const [armed, setArmed] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SetupLink>();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState('');
  if (!actions.length) return null;
  if (receipt) return <SetupReceipt receipt={receipt} href={back}/>;
  return <section className="panel staff-block staff-lifecycle" aria-labelledby="lifecycle-title">
    <h2 id="lifecycle-title">Account access</h2>
    <p>{armed ? staffActions[armed][1] : row.status === 'PENDING' ? 'Manage the link for this pending account.' : staffActions[actions[0]][1]}</p>
    {error && <p role="alert" className="notice warn">{error}</p>}
    {done && <p role="status">{done}</p>}
    <div className="staff-actions">
      {actions.filter(action => !armed || action === armed).map(action => <button key={action} className={'button ' + (armed ? 'primary' : 'secondary')} type="button" disabled={pending} onClick={async () => {
        if (!armed) { setArmed(action); return; }
        setPending(true); setError(''); setDone('');
        try {
          const result = await submit(action, { revision: row.revision }, row.id);
          setArmed('');
          if (action === 'reissue') setReceipt(result);
          else { setDone(action === 'suspend' ? 'Access suspended.' : action === 'cancel' ? 'Setup link revoked.' : 'Access reactivated.'); router.refresh(); }
        } catch (err) { setError(message(err)); }
        finally { setPending(false); }
      }}>{pending ? 'Saving…' : (armed ? 'Confirm: ' : '') + staffActions[action][0]}</button>)}
      {armed && <button type="button" className="button subtle" disabled={pending} onClick={() => setArmed('')}>Cancel</button>}
    </div>
  </section>;
}

export function RoleEditor({ role, catalog, writable, canDelete }: {
  role: RoleRecord | null; catalog: string[]; writable: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState(false);
  const [review, setReview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('');
  const canEdit = writable && !role?.protected;
  const before = role?.permissions ?? [];
  const added = selected.filter(key => !before.includes(key));
  const removed = before.filter(key => !selected.includes(key));
  const groups = useMemo(() => {
    const entries: Record<string, ReturnType<typeof permissionInfo>[]> = {};
    for (const key of [...new Set([...catalog, ...(role?.permissions ?? [])])]) {
      const info = permissionInfo(key);
      if (only && !selected.includes(key)) continue;
      if (![info.label, info.group, key].some(value => value.toLowerCase().includes(query.toLowerCase().trim()))) continue;
      (entries[info.group] ??= []).push(info);
    }
    return Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, only, query, role, selected]);
  function change(keys: string[]) { setSelected(keys); setReview(false); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    if (!review) { setReview(true); return; }
    setError(''); setPending(true);
    try {
      await submit(role ? 'role-edit' : 'role-create', {
        role_name: name, permissions: selected, ...(role && { revision: role.revision }),
      }, role?.id);
      router.refresh(); router.push(roleDirectory);
    } catch (err) { setError(message(err)); }
    finally { setPending(false); }
  }
  return <>
    <form onSubmit={save} className="staff-form">
      <section className="panel staff-block">
        <h2>Role details</h2>
        <div className="staff-grid">
          <label>Role name<input name="name" value={name} onChange={e => { setName(e.target.value); setReview(false); }}
            readOnly={!canEdit || role?.builtIn} required minLength={2} maxLength={80}/></label>
          {!role && canEdit && <label>Start from a template <small>Optional</small><select value={template} onChange={e => {
            const next = templates.find(item => item.name === e.target.value);
            setTemplate(e.target.value);
            if (next) {
              if (!name || name === template) setName(next.name);
              change(next.grants.filter(key => catalog.includes(key)));
            }
          }}><option value="">Start with no permissions</option>{templates.map(item => <option key={item.name}>{item.name}</option>)}</select>
            <small>{templates.find(item => item.name === template)?.detail ?? 'Templates provide a small starting set of permissions.'}</small></label>}
        </div>
        {role && <p>{role.assigned} assigned {role.assigned === 1 ? 'account' : 'accounts'}{role.protected ? ' · Protected role' : ''}</p>}
      </section>
      <section className="panel staff-block">
        <div className="staff-toolbar"><div><h2>Permissions</h2><p aria-live="polite">{selected.length} selected · {selected.filter(key => permissionInfo(key).sensitive).length} sensitive</p></div>
          <div className="staff-actions"><label className="staff-check"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)}/> Selected only</label>
            <label className="staff-search"><Search size={16} aria-hidden="true"/><input aria-label="Find permissions" type="search"
              placeholder="Find a permission" value={query} onChange={e => setQuery(e.target.value)}/></label></div></div>
        <div className="staff-permissions">
          {groups.map(([group, grants]) => <fieldset className="staff-permission-group" key={group}>
            <legend>{group}</legend>
            {grants.map(info => <label className="staff-check" key={info.key}>
              <input type="checkbox" checked={selected.includes(info.key)}
                disabled={!canEdit || pending || !catalog.includes(info.key) && !selected.includes(info.key)}
                onChange={e => change(e.target.checked ? [...selected, info.key] : selected.filter(key => key !== info.key))}/>
              <span>{info.label}<small>{info.key}</small></span>
              {(info.sensitive || !catalog.includes(info.key)) && <span className="staff-badge staff-pending">
                {catalog.includes(info.key) ? 'Sensitive' : 'Legacy'}</span>}</label>)}
          </fieldset>)}
          {!groups.length && <p className="muted">No matching permissions.</p>}
        </div>
      </section>
      {review && <section className="panel staff-block" aria-live="polite">
        <h2>Review changes</h2>
        <p>{role?.assigned ? `Permission changes replace the grants of all ${role.assigned} assigned accounts, including individual overrides.`
          : 'This role controls what assigned staff can access.'}</p>
        {role && name !== role.name && <p>Rename {role.name} to {name.trim()}.</p>}
        {!selected.length && <p>This role grants no feature access.</p>}
        {added.length > 0 && <p><strong>Grant:</strong> {added.map(key => permissionInfo(key).label).join(', ')}</p>}
        {removed.length > 0 && <p><strong>Revoke:</strong> {removed.map(key => permissionInfo(key).label).join(', ')}</p>}
      </section>}
      {error && <p role="alert" className="notice warn">{error}</p>}
      <div className="staff-actions">
        {canEdit && <button className="button primary" type="submit" disabled={pending || selected.some(key => !catalog.includes(key))}>
          {pending ? 'Saving…' : review ? 'Confirm and save role' : 'Review changes'}</button>}
        {review && <button className="button secondary" type="button" onClick={() => setReview(false)}>Back to editing</button>}
        <Link className="button secondary" href={roleDirectory}>Back to roles</Link>
      </div>
    </form>
    {role && canDelete && !role.protected && !role.builtIn && <section className="panel staff-block staff-lifecycle">
      <h2>Remove role</h2>
      <p>{role.assigned ? 'Reassign the accounts that use this role before deleting it.' : 'Deleting this role removes it from future assignments.'}</p>
      <div className="staff-actions"><button className="button secondary" type="button" disabled={pending || role.assigned > 0} onClick={async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setPending(true); setError('');
        try { await submit('role-delete', {}, role.id); router.refresh(); router.push(roleDirectory); }
        catch (err) { setError(message(err)); }
        finally { setPending(false); }
      }}>{confirmDelete ? 'Confirm delete role' : 'Delete role'}</button>
      {confirmDelete && <button type="button" className="button subtle" disabled={pending} onClick={() => setConfirmDelete(false)}>Cancel</button>}</div>
    </section>}
  </>;
}

export function AcceptStaffSetup() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (password !== data.get('confirmation')) { setError('The passwords do not match.'); return; }
    const token = window.location.hash.slice(1);
    if (!/^[\w-]{43}$/.test(token)) { setError('Open the full setup link from your administrator.'); return; }
    setError(''); setPending(true);
    try {
      await submit('accept', { token, password });
      window.history.replaceState(null, '', window.location.pathname);
      setDone(true);
    } catch (err) { setError(message(err)); }
    finally { setPending(false); }
  }
  if (done) return <div className="staff-block"><h2>Account is ready</h2><p>Sign in with your phone number and new password.</p>
    <a className="button primary" href={adminPath('/sign-in')} onClick={event => {
      event.preventDefault();
      window.location.assign(event.currentTarget.href);
    }}>Go to staff sign-in</a></div>;
  return <form className="staff-form staff-block" onSubmit={accept}>
    <label>New password<input autoComplete="new-password" name="password" type="password" required minLength={15} maxLength={256}/>
      <small>Use 15 to 128 characters. A password manager or a long passphrase works well.</small></label>
    <label>Confirm password<input autoComplete="new-password" name="confirmation" type="password" required minLength={15} maxLength={256}/></label>
    {error && <p role="alert" className="notice warn">{error}</p>}
    <div className="staff-actions"><button className="button primary" type="submit" disabled={pending}>{pending ? 'Setting password…' : 'Activate account'}</button></div>
    <p className="muted">If your setup link has expired, ask your administrator for a new one.</p>
  </form>;
}
