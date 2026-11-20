'use client';

export function PrintReport() {
  return <button className="button primary" type="button" onClick={() => window.print()}>Print or save PDF</button>;
}
