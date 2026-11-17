'use client';

import { useRouter } from 'next/navigation';
import { ChevronsUpDown, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { stockSearchPath, stockSorts, type ProductionStockFilters } from '@/lib/production-stock-query';
import styles from './production-stock-report.module.css';

type Location = { value: string; label: string };

export function ProductionStockFiltersForm({ filters, locations, selected }: {
  filters: ProductionStockFilters; locations: Location[]; selected: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters);
  const [locationSearch, setLocationSearch] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const popup = useRef<HTMLDetailsElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (event.target instanceof Node && !popup.current?.contains(event.target)) popup.current?.removeAttribute('open');
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && popup.current?.open) {
        popup.current.open = false;
        popup.current.querySelector('summary')?.focus();
      }
    }
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('keydown', escape); };
  }, []);
  const active = draft.businessLocation === 'all' ? [] : draft.businessLocation?.split(',') ?? selected;
  const visibleLocations = locations.filter(location => location.label.toLowerCase().includes(locationSearch.trim().toLowerCase()));
  const labels = locations.filter(location => active.includes(location.value));
  function update(update: Partial<ProductionStockFilters>, slow = false) {
    const next = { ...draft, ...update };
    setDraft(next);
    clearTimeout(timer.current);
    const navigate = () => router.replace(stockSearchPath(next), { scroll: false });
    if (slow) timer.current = setTimeout(navigate, 330);
    else navigate();
  }
  function toggle(id: string) {
    const next = active.includes(id) ? active.filter(item => id !== item) : [...active, id];
    update({ businessLocation: next.join(',') || 'all' });
  }
  function clear() {
    update({ businessLocation: 'all' });
  }
  return <form className={styles.filters} action={stockSearchPath(filters)} onSubmit={event => {
    event.preventDefault();
    clearTimeout(timer.current);
    router.replace(stockSearchPath(draft), { scroll: false });
  }}>
    <div className={styles.field}>
      <div className={styles.locationLabel}>
        <span id="stock-report-location">Business Location</span>
        {active.length > 0 && <button type="button" className={styles.clearLocations} onClick={clear}><X size={12}/> Clear All</button>}
      </div>
      <details className={styles.locationPicker} ref={popup}>
        <summary aria-labelledby="stock-report-location" className={styles.locationTrigger}>
          {!labels.length ? <span className={styles.muted}>Select locations...</span> : labels.length <= 2
            ? <div className={styles.inlineLabels}>{labels.map(location => <span key={location.value}>{location.label}</span>)}</div>
            : <span>{labels.length} locations selected</span>}
          <ChevronsUpDown size={16} aria-hidden="true"/>
        </summary>
        <div className={styles.locationPopup}>
          <input placeholder="Search locations..." aria-label="Search locations" value={locationSearch}
            onChange={event => setLocationSearch(event.currentTarget.value)} />
          <button type="button" onClick={() => update({ businessLocation: locations.map(location => location.value).join(',') || 'all' })}>Select All</button>
          <button type="button" onClick={clear}>All Locations</button>
          {visibleLocations.map(location => <label key={location.value}>
            <input type="checkbox" checked={active.includes(location.value)} onChange={() => toggle(location.value)} />{location.label}
          </label>)}
          {!visibleLocations.length && <p>No location found.</p>}
        </div>
      </details>
      {labels.length > 0 && <div className={styles.locationTags}>
        {labels.map(location => <button type="button" key={location.value} onClick={() => toggle(location.value)} aria-label={`Remove ${location.label}`}>
          {location.label}<X size={12} />
        </button>)}
      </div>}
    </div>
    <label className={styles.field}>SKU<input name="skuQuery" placeholder="Search by sku" maxLength={100} value={draft.skuQuery ?? ''}
      onChange={event => update({ skuQuery: event.currentTarget.value || undefined, product: undefined }, true)} /></label>
    <label className={styles.field}>Search<input name="searchQuery" placeholder="Search by name, barcode, etc." maxLength={100}
      value={draft.searchQuery ?? ''} onChange={event => update({ searchQuery: event.currentTarget.value || undefined, product: undefined }, true)} /></label>
    <label className={styles.field}>Sort By
      <span className={styles.select}><select name="sortBy" value={draft.sortBy} onChange={event => update({ sortBy: event.currentTarget.value })}>
        {stockSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select><ChevronDown size={16} aria-hidden="true"/></span>
    </label>
    <div className={styles.field}>
      <span id="stock-report-sort-order">Sort Order</span>
      <div className={styles.sort} role="group" aria-labelledby="stock-report-sort-order">
        <button type="button" aria-pressed={draft.sortOrder === 'desc'} onClick={() => update({ sortOrder: 'desc' })}>Desc</button>
        <button type="button" aria-pressed={draft.sortOrder === 'asc'} onClick={() => update({ sortOrder: 'asc' })}>Asc</button>
      </div>
    </div>
  </form>;
}

export function ProductionStockPageSize({ filters, size, options }: { filters: ProductionStockFilters; size: string; options: string[] }) {
  const router = useRouter();
  return <label className={styles.select}>
    <select value={size} aria-label="Stocks per page" onChange={event => router.replace(
      stockSearchPath(filters, { limit: event.currentTarget.value === '20' ? undefined : event.currentTarget.value }), { scroll: false },
    )}>
      {options.map(value => <option key={value} value={value}>{value === 'all' ? 'All' : value}</option>)}
    </select>
    <ChevronDown size={16} aria-hidden="true"/>
  </label>;
}

export function ProductionStockDialog({ closeUrl, label, children, compact = false }: { closeUrl: string; label: string; children: ReactNode; compact?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  const close = () => router.replace(closeUrl, { scroll: false });
  return <dialog className={styles.dialog} data-compact={compact || undefined} ref={dialog} aria-label={label}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2>{label}</h2><button type="button" onClick={close} aria-label="Close stock details"><X size={17}/></button></header>
    <div className={styles.dialogContent}>{children}</div>
  </dialog>;
}
