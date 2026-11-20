'use client';

import * as Popover from '@radix-ui/react-popover';
import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { adminPath } from '@/lib/paths';
import { permissionInfo } from '@/lib/staff-access';
import styles from './production-staff-directory.module.css';

type Grants = { permissions: string[]; catalog: string[] };

export function ProductionAccessActions({ kind, id, name, path, edit, permissions, remove }: {
  kind: 'staff' | 'role'; id: string; name: string; path: string; edit: boolean; permissions?: boolean; remove: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'remove' | 'permissions'>('remove');
  const [grants, setGrants] = useState<Grants>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const type = kind === 'staff' ? 'Staff' : 'Role';
  const title = action === 'permissions' ? 'Manage Permissions' : 'Delete ' + type;
  const groups = new Map<string, string[]>();
  for (const key of grants?.catalog ?? []) {
    const group = permissionInfo(key).group;
    const keys = groups.get(group) ?? [];
    keys.push(key);
    groups.set(group, keys);
  }

  async function show(next: typeof action) {
    setAction(next);
    setOpen(false);
    setError('');
    setGrants(undefined);
    dialog.current?.showModal();
    if (next !== 'permissions') return;
    setBusy(true);
    try {
      const response = await fetch(adminPath('/api/staff-access?id=' + encodeURIComponent(id)));
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setGrants(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load permissions.');
    } finally {
      setBusy(false);
    }
  }

  function setKeys(keys: string[], selected: boolean) {
    setGrants(current => current && { ...current, permissions: selected
      ? [...new Set([...current.permissions, ...keys])]
      : current.permissions.filter(key => !keys.includes(key)) });
  }

  async function save() {
    if (busy || action === 'permissions' && !grants) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(adminPath('/api/staff-access'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: action === 'permissions' ? 'staff-permissions' : kind + '-delete',
          values: action === 'permissions' ? { permissions: grants?.permissions } : {} }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Could not save the change.');
      }
      dialog.current?.close();
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the change.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={styles.actionTrigger} aria-label={'Actions for ' + name}>
        <Ellipsis size={16} aria-hidden="true"/>
      </Popover.Trigger>
      <Popover.Portal><Popover.Content className={styles.actionMenu} align="end" sideOffset={4} aria-label={type + ' actions'}>
        <Link href={path} onClick={() => setOpen(false)}>{edit ? 'Update ' + type : 'View ' + type}</Link>
        {permissions && <button type="button" onClick={() => void show('permissions')}>Manage Permissions</button>}
        {remove && <button type="button" className={styles.deleteAction} onClick={() => void show('remove')}>Delete {type}</button>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <dialog ref={dialog} className={styles.accessDialog} data-wide={action === 'permissions'} aria-label={title}
      onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2>{title}</h2>
      {action === 'remove' && <p>Are you sure you want to delete <strong>{name}</strong>?</p>}
      {action === 'permissions' && busy && !grants && <p role="status">Loading permissions…</p>}
      {grants && <div className={styles.grantGroups}>{Array.from(groups, ([group, keys]) => <fieldset key={group} disabled={busy}>
        <legend>{group}</legend>
        <label><input type="checkbox" checked={keys.every(key => grants.permissions.includes(key))}
          onChange={event => setKeys(keys, event.target.checked)}/> Select all</label>
        {keys.map(key => <label key={key}><input type="checkbox" checked={grants.permissions.includes(key)}
          onChange={event => setKeys([key], event.target.checked)}/> {permissionInfo(key).label}</label>)}
      </fieldset>)}</div>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      <footer>
        <button className="button secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className={'button primary ' + (action === 'remove' ? styles.confirmDelete : '')} type="button"
          disabled={busy || action === 'permissions' && !grants} onClick={() => void save()}>
          {busy ? 'Working…' : action === 'permissions' ? 'Update Permissions' : 'Delete'}
        </button>
      </footer>
    </dialog>
  </>;
}
