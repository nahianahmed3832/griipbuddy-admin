'use client';

import { ChevronDown, Filter, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { productionPurchasePath, productionRatesPath, purchaseQueryPath } from '@/lib/production-purchase-query';
import styles from './production-purchases.module.css';

type Choice = { label: string; value: string };

function ChoiceField({ label, children, selected, change }: {
  label: string; children: ReactNode; selected: string; change: (value: string) => void;
}) {
  return <label className={styles.field}>{label}
    <span className={styles.select}><select value={selected} onChange={event => change(event.currentTarget.value)}>{children}</select>
      <ChevronDown size={16} aria-hidden="true"/></span>
  </label>;
}

export function ProductionPurchaseFilters({ filters, locations, vendors, statuses, region, limit }: {
  filters: Record<string, string | undefined>; locations: Choice[]; vendors: Choice[]; statuses: Choice[]; region: string; limit?: string;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(filters);
  function change(key: string, value: string) {
    const next = { ...selection, [key]: value || undefined };
    setSelection(next);
    router.replace(purchaseQueryPath(productionPurchasePath, { ...next, region, limit }), { scroll: false });
  }
  const fields = [
    { label: 'Business Location', key: 'business_location', options: locations },
    { label: 'Supplier', key: 'supplier', options: vendors },
    { label: 'Purchase Status', key: 'status', options: statuses },
  ];
  return <details className={styles.purchaseFilters} open={Object.values(selection).some(Boolean) || undefined}>
    <summary><Filter size={20} aria-hidden="true"/> Filter</summary>
    <div className={styles.stockFields}>
      {fields.map(({ label, key, options }) => <ChoiceField key={key} label={label} selected={selection[key] ?? ''} change={value => change(key, value)}>
        <option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </ChoiceField>)}
    </div>
  </details>;
}

export function ProductionRatesFilters({ supplier, term, vendors, region, page }: {
  supplier?: string; term: string; vendors: Choice[]; region: string; page: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(term);
  const [selected, setSelected] = useState(supplier ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function update(value: string, field: string, nextPage?: string) {
    clearTimeout(timer.current);
    router.replace(purchaseQueryPath(productionRatesPath, { region, supplier: field, q: value, page: nextPage }), { scroll: false });
  }
  return <div className={styles.ratesFilters}>
    <ChoiceField label="Supplier" selected={selected} change={value => { setSelected(value); update(query, value); }}>
      <option value="">All suppliers</option>{vendors.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </ChoiceField>
    <label className={styles.field}>Filter this page
      <span className={styles.search}><Search size={17} aria-hidden="true"/><input value={query} placeholder="Name or SKU…" maxLength={80}
        onChange={event => {
          const value = event.currentTarget.value;
          setQuery(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => update(value, selected, page > 1 ? String(page) : undefined), 250);
        }}/></span>
    </label>
  </div>;
}

export function ProductionPurchasePageSize({ path, limit, params }: {
  path: string; limit: string; params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  return <span className={styles.select}><select value={limit} aria-label="Purchases per page" onChange={event =>
    router.replace(purchaseQueryPath(path, { ...params, limit: event.currentTarget.value }), { scroll: false })}>
    {['20','40','60','80','100','all'].map(item => <option key={item} value={item}>{item === 'all' ? 'All' : item}</option>)}
  </select><ChevronDown size={16} aria-hidden="true"/></span>;
}
