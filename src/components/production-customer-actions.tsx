'use client';

import * as Popover from '@radix-ui/react-popover';
import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import styles from './production-customers.module.css';
import accessStyles from './production-staff-directory.module.css';

export function ProductionCustomerSearch({ query, region, limit }: { query: string; region: string; limit?: string }) {
  const [search, setSearch] = useState(query);
  const router = useRouter();
  const applied = useRef(query);
  useEffect(() => {
    const next = search.trim();
    if (next === applied.current) return;
    const timeout = window.setTimeout(() => {
      applied.current = next;
      const params = new URLSearchParams({ region });
      if (next) params.set('q', next);
      if (limit && limit !== '20') params.set('limit', limit);
      router.replace('/dashboard/customers?' + params.toString(), { scroll: false });
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, region, limit, router]);
  return <input aria-label="Search customers" className={styles.search} type="search" placeholder="Search customers..."
    value={search} onChange={event => setSearch(event.target.value)} maxLength={100}/>;
}

export function ProductionCustomerActions({ name, passwordPath }: { name: string; passwordPath?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const timeout = useRef<number>(0);
  useEffect(() => () => clearTimeout(timeout.current), []);

  function unavailable(message: string) {
    setOpen(false);
    setMessage(message);
    clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setMessage(''), 3000);
  }

  return <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={accessStyles.actionTrigger} aria-label={'Actions for ' + name}><Ellipsis size={16}/></Popover.Trigger>
      <Popover.Portal><Popover.Content className={accessStyles.actionMenu} align="end" sideOffset={4}>
        <button type="button" onClick={() => unavailable('Block option coming soon!')}>Block</button>
        {passwordPath && <Link href={passwordPath} onClick={() => setOpen(false)}>Change Password</Link>}
        <button className={accessStyles.deleteAction} type="button" onClick={() => unavailable('Delete option coming soon!')}>Delete Customer</button>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {message && <span role="status" className={styles.toast}>{message}</span>}
  </>;
}
