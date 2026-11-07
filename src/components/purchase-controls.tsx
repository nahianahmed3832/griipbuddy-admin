'use client';

import { Download, Ellipsis, Pencil, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

export function PurchaseActions({ id, label, edit, invoice }: { id: string; label: string; edit?: string; invoice?: string }) {
  const menu = useRef<HTMLDivElement>(null);
  const menuId = 'purchase-actions-' + id;
  return <>
    <button type="button" className="icon-button" aria-label={'Actions for purchase ' + label} popoverTarget={menuId}
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (menu.current) {
          menu.current.style.left = Math.max(8, rect.right - 132) + 'px';
          menu.current.style.top = (rect.bottom + 100 <= window.innerHeight ? rect.bottom + 4 : rect.top - (edit && invoice ? 88 : 48)) + 'px';
        }
      }}><Ellipsis size={18}/></button>
    <div className="purchase-menu" id={menuId} popover="auto" ref={menu}>
      {edit && <Link href={edit} onClick={() => menu.current?.hidePopover()}><Pencil size={16}/> Edit</Link>}
      {invoice && <Link href={invoice} onClick={() => menu.current?.hidePopover()}><Download size={16}/> Invoice</Link>}
    </div>
  </>;
}

export function PrintInvoice() {
  return <button className="button primary" type="button" onClick={() => window.print()}><Printer size={16}/> Print / Save PDF</button>;
}
