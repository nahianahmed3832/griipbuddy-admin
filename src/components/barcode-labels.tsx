'use client';

import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BarcodeLabel } from '@/lib/barcode-data';

export function BarcodeImage({ code, label = false }: { code: string; label?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (!svg.current) return;
    const options = { width: 2, height: label ? 74 : 48, margin: 0, marginLeft: 22, marginRight: 22,
      fontSize: 18, displayValue: label };
    let ean = false;
    if (/^\d{13}$/.test(code)) {
      JsBarcode(svg.current, code, { ...options, format: 'EAN13', valid: valid => { ean = valid; } });
    }
    if (!ean) JsBarcode(svg.current, code, { ...options, format: 'CODE128' });
  }, [code, label]);
  return <svg ref={svg} className="barcode-image" aria-hidden="true"/>;
}

export function BarcodePrint({ labels, close }: { labels: BarcodeLabel[]; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useLayoutEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} className="form-dialog barcode-print-sheet" aria-labelledby={headingId} onClose={close}>
    <div className="barcode-print-toolbar">
      <h2 id={headingId}>Print {labels.length} {labels.length === 1 ? 'label' : 'labels'}</h2>
      <div className="page-actions">
        <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Close</button>
        <button type="button" className="button primary" onClick={() => window.print()}><Printer size={16}/> Print labels</button>
      </div>
    </div>
    <ul className="barcode-label-grid">
      {labels.map(({ barcode, sku }) => <li key={barcode} className="barcode-label">
        <strong>{sku}</strong><BarcodeImage code={barcode} label/><span className="sr-only">{barcode}</span>
      </li>)}
    </ul>
  </dialog>, document.body);
}
