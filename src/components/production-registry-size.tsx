'use client';

import { useRouter } from 'next/navigation';
import styles from './production-catalog.module.css';

export function RegistryPageSize({ current, choices, path, params }: {
  current: string; choices: string[]; path: string; params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  return <select className={styles.select} value={current} aria-label="Rows per page" onChange={event => {
    const query = new URLSearchParams();
    Object.entries({ ...params, limit: event.target.value === '20' ? undefined : event.target.value })
      .forEach(([name, value]) => { if (value) query.set(name, value); });
    router.replace(path + (query.size ? '?' + query.toString() : ''), { scroll: false });
  }}>
    {choices.map(size => <option key={size} value={size}>{size === 'all' ? 'All' : size}</option>)}
  </select>;
}
