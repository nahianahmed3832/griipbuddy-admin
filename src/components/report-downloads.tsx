'use client';

import { ArrowDownToLine } from 'lucide-react';
import { useRef, useState } from 'react';

export function ReportDownloads({ csv, xlsx }: { csv: string; xlsx: string }) {
  const running = useRef(false);
  const [active, setActive] = useState<'csv' | 'xlsx'>();
  const [error, setError] = useState('');

  async function download(format: 'csv' | 'xlsx') {
    if (running.current) return;
    running.current = true;
    setActive(format);
    setError('');
    try {
      const response = await fetch(format === 'csv' ? csv : xlsx);
      if (!response.ok) throw new Error('Export unavailable');
      const filename = /^attachment;\s*filename="([a-zA-Z0-9_-]{1,150}\.(?:csv|xlsx))"$/.exec(response.headers.get('content-disposition') ?? '')?.[1];
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(await response.blob());
      try {
        link.href = objectUrl;
        link.download = filename ?? 'report.' + format;
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch {
      setError('The report could not be exported. Try again.');
    } finally {
      running.current = false;
      setActive(undefined);
    }
  }

  return <>
    {(['csv', 'xlsx'] as const).map(format => <button type="button" className="button secondary" key={format}
      disabled={Boolean(active)} onClick={() => download(format)}>
      <ArrowDownToLine size={16} aria-hidden="true"/>{active === format ? 'Exporting…' : format === 'csv' ? 'CSV' : 'Excel'}
    </button>)}
    {error && <span role="alert" className="notice warn">{error}</span>}
  </>;
}
