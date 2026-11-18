'use client';

import * as Popover from '@radix-ui/react-popover';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { Region } from '@/lib/sections';
import { orderNumber, orderRequest, type Order, type OrderAction } from '@/lib/website-orders';
import type { OrderDialogKind } from './website-orders-dialog';
import styles from './production-website-orders.module.css';

type DirectStatus = 'DELIVERED' | 'PENDING_RETURN';

export function useManualOrderStatus(region: Region, notify: (message: string) => void) {
  const router = useRouter();
  const inFlight = useRef(new Map<string, DirectStatus>());
  const [updating, setUpdating] = useState<ReadonlyMap<string, DirectStatus>>(new Map());
  async function updateStatus(id: string, status: DirectStatus) {
    if (inFlight.current.has(id)) return;
    const label = status === 'DELIVERED' ? 'delivered' : 'pending return';
    inFlight.current.set(id, status);
    setUpdating(new Map(inFlight.current));
    notify('');
    try {
      await orderRequest('update-status', region, { query: { id }, values: { status } });
      notify(`Order marked as ${label} successfully`);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : `Failed to mark order as ${label}`);
    } finally {
      inFlight.current.delete(id);
      setUpdating(new Map(inFlight.current));
    }
  }
  return { updateStatus, updating };
}

export function ProductionOrderMenu({ order, href, editHref, actions, select, updating }: {
  order: Order;
  href: string;
  editHref?: string;
  actions: OrderAction[];
  select: (kind: OrderDialogKind) => void;
  updating?: DirectStatus;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const label = 'Actions for ' + orderNumber(order);
  const orderedKinds: OrderAction['kind'][] = [
    'accept', 'edit', 'update-status', 'note', 'sms', 'pick', 'dispatch', 'handover', 'delivered', 'return', 'pending-return', 'scan-return', 'cancel', 'delete',
  ];
  const items = orderedKinds.flatMap(kind => actions.filter(action => action.kind === kind));

  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const choices = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)'));
    const current = choices.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 :
      event.key === 'ArrowDown' ? (current + 1) % choices.length : (current <= 0 ? choices.length - 1 : current - 1);
    choices[next]?.focus();
  }

  const accepts = ['accept'];
  const leading = items.filter(item => accepts.includes(item.kind));
  const following = items.filter(item => !accepts.includes(item.kind));

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <button type="button" className={styles.iconButton} aria-label={label} aria-haspopup="menu">
        <MoreHorizontal size={18}/>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="start" sideOffset={4} collisionPadding={8} className={styles.orderMenu} ref={menu} role="menu" aria-label={label}
        onKeyDown={move} onOpenAutoFocus={event => {
          event.preventDefault();
          menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
        }}>
        {leading.map(({ kind, label }) => <button type="button" key={kind} role="menuitem"
          data-tone={kind === 'decline-stock' ? 'danger' : 'positive'} className={styles.orderMenuItem}
          onClick={() => { setOpen(false); select(kind); }}>{label}</button>)}
        {!!leading.length && <div className={styles.orderMenuSeparator} role="separator"/>}
        <Link href={href} role="menuitem" className={styles.orderMenuItem} onClick={() => setOpen(false)}>View Details</Link>
        {following.map(({ kind, label }, index) => {
          const previous = following[index - 1]?.kind ?? '';
          const returns = ['delivered', 'return', 'pending-return', 'scan-return'];
          const divider = returns.includes(kind) && !returns.includes(previous) ||
            ['cancel','delete'].includes(kind) && !['cancel','delete'].includes(previous);
          const tone = kind === 'delivered' ? 'positive' : kind === 'pending-return' || kind === 'scan-return' ? 'warning' :
            ['return', 'cancel', 'delete'].includes(kind) ? 'danger' : undefined;
          const direct = kind === 'delivered' || kind === 'pending-return';
          const loading = kind === 'delivered' ? updating === 'DELIVERED' : kind === 'pending-return' && updating === 'PENDING_RETURN';
          return <div key={kind} role="presentation">
            {divider && <div className={styles.orderMenuSeparator} role="separator"/>}
            {kind === 'edit' && editHref ? <Link href={editHref} role="menuitem" className={styles.orderMenuItem}
              onClick={() => setOpen(false)}>{label}</Link> : <button type="button" role="menuitem" data-tone={tone}
              className={styles.orderMenuItem} disabled={direct && !!updating}
              onClick={() => { setOpen(false); select(kind); }}>{loading ? label.replace('Mark', 'Marking') + '…' : label}</button>}
          </div>;
        })}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
