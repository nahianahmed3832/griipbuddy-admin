'use client';

import { FileDown } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './production-catalog.module.css';
import editor from './production-product-editor.module.css';

export type StockHistoryItem = { sku: string; attrs: string; quantity: number };
type Report = { date: string; from: string; to: string; operator: string; items: StockHistoryItem[]; expenses: string[] };

export function StockHistoryItems({ items }: { items: StockHistoryItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>{items.slice(0, 2).map((item, index) => <div key={index}>{item.sku} ({item.quantity})</div>)}
    {items.length > 2 && <>
      <button type="button" className={styles.outline} onClick={() => dialog.current?.showModal()}>See More</button>
      <dialog ref={dialog} className={editor.editorDialog} aria-label="All Items">
        <div className={editor.dialogHeading}><h3>All Items</h3></div>
        <ol>{items.map((item, index) => <li key={index}>SKU: {item.sku}{item.attrs && ' (' + item.attrs + ')'} · Qty: {item.quantity}</li>)}</ol>
        <div className={editor.saveActions}><button type="button" className={styles.outline} onClick={() => dialog.current?.close()}>Close</button></div>
      </dialog>
    </>}
  </>;
}

export function StockTransferInvoice({ record }: { record: Report }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function save() {
    setBusy(true); setError(false);
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Stock Transfer Invoice', 14, 18);
      doc.setFontSize(11);
      doc.text(['Date: ' + record.date, 'From: ' + record.from, 'To: ' + record.to, 'Transfer By: ' + record.operator], 14, 30);
      autoTable(doc, { startY: 54, head: [['SKU', 'Variant', 'Quantity']], body: record.items.map(item => [item.sku, item.attrs, item.quantity]) });
      if (record.expenses.length > 0) autoTable(doc, { head: [['Expenses']], body: record.expenses.map(expense => [expense]) });
      doc.save('Stock-Transfer-' + record.date.slice(0, 10).replaceAll('/', '-') + '.pdf');
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <><button type="button" className={styles.outline} disabled={busy} onClick={() => void save()}><FileDown size={16}/>Invoice</button>
    {error && <p className={styles.error} role="alert">Could not download the invoice.</p>}</>;
}
