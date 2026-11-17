'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { productionReportPeriods } from '@/lib/production-report-period';

type Option = { value: string; label: string };
export type ReportFilter = { key: string; label: string; type: string; options: Option[]; fallback: string };

export function ProductionReportSelect({ label, value, options, change, name, fieldClassName, selectClassName }: { label: string; value: string; options: readonly Option[]; change: (value: string) => void; name?: string; fieldClassName?: string; selectClassName?: string }) {
  const labelId = useId();
  return <div className={fieldClassName || "production-report-field"}>
    <span id={labelId}>{label}</span>
    <Select.Root name={name} value={value || '__all__'} onValueChange={value => change(value === '__all__' ? '' : value)}>
      <Select.Trigger className={["production-report-select", selectClassName].filter(Boolean).join(" ")} aria-labelledby={labelId}>
        <Select.Value/>
        <Select.Icon asChild><ChevronDown size={16} aria-hidden="true"/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="production-report-select-options" position="popper">
          <Select.ScrollUpButton className="production-report-select-scroll"><ChevronUp size={16}/></Select.ScrollUpButton>
          <Select.Viewport className="production-report-select-viewport">
            {options.map(option => <Select.Item className="production-report-select-option" key={option.value} value={option.value || '__all__'}>
              <span className="production-report-select-indicator"><Select.ItemIndicator><Check size={16}/></Select.ItemIndicator></span>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="production-report-select-scroll"><ChevronDown size={16}/></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}

function SearchFilter({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  const [search, setSearch] = useState(value);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    // History navigation can change the committed query while this control stays mounted.
    setSearch(value);
    clearTimeout(pending.current);
    return () => clearTimeout(pending.current);
  }, [value]);
  return <label className="production-report-field">
    <span>{label}</span>
    <input type="search" value={search} maxLength={100} placeholder="Type to search" onChange={event => {
      const value = event.currentTarget.value;
      setSearch(value);
      clearTimeout(pending.current);
      pending.current = setTimeout(() => change(value.trim()), 400);
    }}/>
  </label>;
}

function LocationFilter({ value, locations, change }: { value: string[]; locations: Option[]; change: (value: string[]) => void }) {
  const [search, setSearch] = useState('');
  const popup = useRef<HTMLDetailsElement>(null);
  const visible = locations.filter(option => option.label.toLowerCase().includes(search.toLowerCase()));
  const selected = locations.filter(option => value.includes(option.value));
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target)) popup.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  return <div className="production-report-field">
    <span>Locations</span>
    <details className="production-report-locations" ref={popup} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label={selected.length ? selected.map(option => option.label).join(', ') : 'All locations'}>
        {!selected.length ? <span>All locations</span> : <span className="production-report-location-count">
          {selected.slice(0, 2).map(option => <span key={option.value}>{option.label}</span>)}
          {selected.length > 2 && <span>+ {selected.length - 2} more</span>}
        </span>}
        <ChevronDown size={16} aria-hidden="true"/>
      </summary>
      <div className="production-report-location-options">
        <input type="search" aria-label="Search locations" placeholder="Search..." value={search}
          onChange={event => setSearch(event.currentTarget.value)}/>
        <fieldset>
          <legend className="production-report-visually-hidden">Locations</legend>
          {visible.length ? visible.map(option => <label key={option.value}>
            <input type="checkbox" value={option.value} checked={value.includes(option.value)} onChange={event => {
              change(event.currentTarget.checked ? [...value, option.value] : value.filter(id => id !== option.value));
            }}/>{option.label}
          </label>) : <span>No results found.</span>}
        </fieldset>
        {selected.length > 0 && <button type="button" onClick={() => change([])}><X size={14} aria-hidden="true"/>Clear</button>}
        <button type="button" onClick={() => { if (popup.current) popup.current.open = false; }}>Close</button>
      </div>
    </details>
  </div>;
}

export function ProductionReportFilters({ path, region, period, from, to, usesPeriod, usesLocations, locations, selectedLocations, compares,
  compare, currency, filters, values }: {
  path: string;
  region: 'BD' | 'INTERNATIONAL';
  period: string;
  from: string;
  to: string;
  usesPeriod: boolean;
  usesLocations: boolean;
  locations: Option[];
  selectedLocations: string[];
  compares: boolean;
  compare: boolean;
  currency: string;
  filters: ReportFilter[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const nextQuery = useRef(new URLSearchParams(params.toString()));

  useEffect(() => { nextQuery.current = new URLSearchParams(params.toString()); }, [params]);

  function update(changes: Record<string, string>) {
    const query = new URLSearchParams(nextQuery.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete('page');
    query.delete('refresh');
    query.delete('filterApplied');
    query.delete('location');
    if (region === 'INTERNATIONAL') query.set('region', region);
    nextQuery.current = query;
    router.replace(path + (query.size ? '?' + query : ''), { scroll: false });
  }

  return <div className="production-report-filters panel" aria-label="Report filters" role="group">
    {usesPeriod && <ProductionReportSelect label="Period" value={period}
      options={period === 'last90' ? [...productionReportPeriods, { value: 'last90', label: 'Last 90 days' }] : productionReportPeriods}
      change={value => update({ period: value, ...(value === 'custom' && { from, to }) })}/>}
    {usesPeriod && period === 'custom' && <div className="production-report-custom-dates">
      <label className="production-report-field"><span>From</span><input type="date" value={from} max={to}
        onChange={event => { if (event.currentTarget.value) update({ from: event.currentTarget.value }); }}/></label>
      <label className="production-report-field"><span>To</span><input type="date" value={to} min={from}
        onChange={event => { if (event.currentTarget.value) update({ to: event.currentTarget.value }); }}/></label>
    </div>}
    {usesLocations && <LocationFilter key={region} locations={locations} value={selectedLocations}
      change={ids => update({ locations: ids.join(',') })}/>}
    {region === 'INTERNATIONAL' && <ProductionReportSelect label="Currency" value={currency}
      options={['BDT', 'USD', 'EUR', 'AUD'].map(code => ({ value: code, label: code }))}
      change={value => update({ currency: value })}/>}
    {filters.map(filter => filter.type === 'search'
      ? <SearchFilter key={filter.key} label={filter.label} value={values[filter.key] ?? ''}
        change={value => update({ [filter.key]: value })}/>
      : <ProductionReportSelect key={filter.key} label={filter.label} value={values[filter.key] ?? filter.fallback}
        options={filter.options} change={value => update({ [filter.key]: value === filter.fallback ? '' : value })}/>)}
    {compares && <label className="production-report-compare">
      <input type="checkbox" role="switch" checked={compare} onChange={event => update({ compare: event.currentTarget.checked ? '' : 'none' })}/>
      Compare with previous period
    </label>}
  </div>;
}
