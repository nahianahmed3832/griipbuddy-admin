'use client';

import * as Popover from '@radix-ui/react-popover';
import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import accessStyles from './production-staff-directory.module.css';

export function ProductionCustomerActions({ name, passwordPath }: { name: string; passwordPath?: string }) {
  const [open, setOpen] = useState(false);
  if (!passwordPath) return '—';
  return <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={accessStyles.actionTrigger} aria-label={'Actions for ' + name}><Ellipsis size={16}/></Popover.Trigger>
      <Popover.Portal><Popover.Content className={accessStyles.actionMenu} align="end" sideOffset={4}>
        <Link href={passwordPath} onClick={() => setOpen(false)}>Change Password</Link>
      </Popover.Content></Popover.Portal>
    </Popover.Root>;
}
