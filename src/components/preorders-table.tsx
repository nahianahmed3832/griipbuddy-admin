'use client';

import { useState } from 'react';
import Link from 'next/link';
import { money, orderDate } from '@/lib/website-orders';
import { preOrderItems, preOrderNumber, preOrderProduct, preOrdersPath, type PreOrderRow } from '@/lib/preorders';
import { Badge, Empty } from './tables';
import { PreOrderBulkActions, usePreOrderInteractive } from './preorders-actions';

export function PreOrdersTable({ rows, total, batches, canUpdate }: { rows: PreOrderRow[]; total: number; batches: string[]; canUpdate: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const ready = usePreOrderInteractive();
  if (!rows.length) return <section className="panel"><Empty title="No pre-orders match" detail="Try another status, date, or search term." /></section>;
  const all = selected.length > 0 && selected.length === rows.length;
  return <section className="panel data-panel" aria-label="Pre-orders">
    <div className="panel-header"><div><h2>Pre-orders ({total})</h2><p>{rows.length} on this page</p></div>
      {!!selected.length && <button type="button" onClick={() => setSelected([])} className="button subtle">Clear selection</button>}
    </div>
    {!!selected.length && canUpdate && <PreOrderBulkActions ids={selected} batches={batches} />}
    <div className="table-scroll" aria-label="Pre-order table" role="region" tabIndex={0}>
      <table>
        <thead><tr>
          {canUpdate && <th scope="col"><input type="checkbox" checked={all} disabled={!ready} aria-label="Select all visible pre-orders" onChange={() => setSelected(all ? [] : rows.map(row => row._id))} /></th>}
          {['Pre-order', 'Customer', 'Products', 'Status', 'Batch', 'Amount', 'Advance', 'Tracking', 'Created by', 'Date'].map(column => <th key={column} scope="col">{column}</th>)}
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row._id}>
          {canUpdate && <td><input type="checkbox" checked={selected.includes(row._id)} disabled={!ready} aria-label={'Select ' + preOrderNumber(row)}
            onChange={() => setSelected(current => current.includes(row._id) ? current.filter(value => value !== row._id) : [...current, row._id])} /></td>}
          <td><Link className="table-link" href={preOrdersPath + '/' + row._id}>{preOrderNumber(row)}</Link></td>
          <td>{row.customer_name}<br />{row.customer_phone}{row.is_called && <><br />Called</>}</td>
          <td>{preOrderItems(row).map((item, index) => <div key={index}>{preOrderProduct(item)} × {item.quantity ?? 1}</div>)}</td>
          <td><Badge value={row.status || 'Requested'} /></td>
          <td>{row.batch || '—'}</td>
          <td>{money(row.total_amount, 'BDT')}</td>
          <td>{row.advance_paid ? 'Received' : money(row.advance_amount, 'BDT')}</td>
          <td>{row.tracking_code || '—'}</td>
          <td>{row.created_by?.full_name || row.order_by || '—'}</td>
          <td>{orderDate(row.createdAt, 'BD')}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
