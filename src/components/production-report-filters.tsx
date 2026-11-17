'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';

export function ProductionReportFilters({ path, children }: { path: string; children: ReactNode }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function apply(form: HTMLFormElement) {
    if (!form.checkValidity()) return;
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value) query.append(key, value);
    }
    router.replace(path + (query.size ? '?' + query : ''), { scroll: false });
  }

  return <form className="production-report-filters panel" aria-label="Report filters" action={adminPath(path)}
    onSubmit={event => {
      event.preventDefault();
      clearTimeout(timer.current);
      apply(event.currentTarget);
    }}
    onChange={event => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
      if (control.name === 'period' && control.value === 'custom') return;
      const form = event.currentTarget;
      clearTimeout(timer.current);
      if (control.type === 'search') timer.current = setTimeout(() => apply(form), 300);
      else apply(form);
    }}>
    {children}
    <button type="submit" className="production-report-submit">Apply filters</button>
  </form>;
}
