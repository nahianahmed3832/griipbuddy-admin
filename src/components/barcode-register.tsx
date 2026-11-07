'use client';

import Link from 'next/link';
import { History, Printer } from 'lucide-react';
import { useState } from 'react';
import { barcodePattern, type BarcodeLabel, type BarcodeRow } from '@/lib/barcode-data';
import { Badge, Empty } from './tables';
import { BarcodeImage, BarcodePrint } from './barcode-labels';

export function BarcodeRegister({ rows, history }: { rows: BarcodeRow[]; history: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [print, setPrint] = useState<BarcodeLabel[]>([]);
  const printable = rows.filter(row => barcodePattern.test(row.barcode));
  const selectedRows = printable.filter(row => selected.includes(row.barcode));
  const all = printable.length > 0 && selectedRows.length === printable.length;
  if (!rows.length) return <section className="panel"><Empty title="No matching barcodes" detail="Try another SKU, barcode, or filter."/></section>;

  return <section className="panel data-panel">
    <div className="panel-header">
      <div><h2>Unit labels</h2><p>Select labels on this page to print them together.</p></div>
      <button type="button" className="button secondary" disabled={!selectedRows.length} onClick={() => setPrint(selectedRows)}>
        <Printer size={16}/> Print selected{selectedRows.length ? ` (${selectedRows.length})` : ''}
      </button>
    </div>
    <div className="table-scroll" role="region" aria-label="Unit labels" tabIndex={0}>
      <table className="barcode-register">
        <thead><tr>
          <th scope="col" className="select-col"><input type="checkbox" aria-label="Select all barcodes on this page" checked={all}
            disabled={!printable.length} onChange={() => setSelected(all ? [] : printable.map(row => row.barcode))}/></th>
          {['SKU', 'Barcode', 'Status', 'Condition', 'Barcode image', 'Generated at', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map(row => {
          const valid = barcodePattern.test(row.barcode);
          return <tr key={row.barcode}>
            <td className="select-col"><input type="checkbox" aria-label={'Select barcode ' + row.barcode} disabled={!valid}
              checked={selected.includes(row.barcode)} onChange={event => {
                const checked = event.currentTarget.checked;
                setSelected(previous => checked ? [...previous, row.barcode] : previous.filter(code => code !== row.barcode));
              }}/></td>
            <td className="primary-cell">{row.sku}<small className="barcode-product">{row.product}</small></td>
            <td><code>{row.barcode}</code></td>
            <td>{row.status && <Badge value={row.status}/>}</td>
            <td>{row.condition.toLowerCase().replaceAll('_', ' ')}</td>
            <td>{valid ? <BarcodeImage code={row.barcode}/> : 'Unavailable'}</td>
            <td><time dateTime={row.createdAt}>{row.createdAt ? `${row.createdAt.slice(0, 16).replace('T', ' ')} UTC` : '—'}</time></td>
            <td>{valid && <div className="barcode-row-actions">
              <Link href={history + '&barcode=' + encodeURIComponent(row.barcode)} className="button subtle" aria-label={'View history for ' + row.barcode}>
                <History size={15}/> View history
              </Link>
              <button type="button" className="button subtle" aria-label={'Print label ' + row.barcode} onClick={() => setPrint([row])}>
                <Printer size={15}/> Print label
              </button>
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!!print.length && <BarcodePrint labels={print} close={() => setPrint([])}/>}
  </section>;
}
