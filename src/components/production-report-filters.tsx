'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductionLocationFilter } from './production-location-filter';
import { productionReportPeriods } from '@/lib/production-report-period';

type Option = { value: string; label: string };
export type ReportFilter = { key: string; label: string; type: string; options: Option[]; fallback: string };

export function ProductionReportSelect({ label, value, options, change, name, fieldClassName, selectClassName }: { label: string; value: string; options: readonly Option[]; change: (value: string) => void; name?: string; fieldClassName?: string; selectClassName?: string }) {
  const labelId = useId();
  return <div className={fieldClassName || "production-report-field"}>
    {name && <input type="hidden" name={name} value={value}/>}
    <span id={labelId}>{label}</span>
    <Select.Root value={value || '__all__'} onValueChange={value => change(value === '__all__' ? '' : value)}>
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

export function ProductionReportFilters({ path, region, period, from, to, usesPeriod, usesLocations, locations, selectedLocations, locationSummary, compares,
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
  locationSummary: string;
  compares: boolean;
  compare: boolean;
  currency: string;
  filters: ReportFilter[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const nextQuery = useRef(new URLSearchParams(params.toString()));

  useEffect(() => { nextQuery.current = new URLSearchParams(params.toString()); }, [params]);

  function update(changes: Record<string, string>) {
    const query = new URLSearchParams(nextQuery.current);
    if (query.has('location')) {
      if (selectedLocations.length) query.set('locations', selectedLocations.join(','));
      query.delete('location');
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete('page');
    query.delete('refresh');
    query.delete('filterApplied');
    if (region === 'INTERNATIONAL') query.set('region', region);
    nextQuery.current = query;
    startTransition(() => router.replace(path + (query.size ? '?' + query : ''), { scroll: false }));
  }

  return <div className="production-report-filters panel" aria-label="Report filters" role="group">
    <span className="production-report-visually-hidden" role="status">{pending ? 'Updating report…' : ''}</span>
    {usesPeriod && <ProductionReportSelect label="Period" value={period}
      options={period === 'last90' ? [...productionReportPeriods, { value: 'last90', label: 'Last 90 days' }] : productionReportPeriods}
      change={value => update({ period: value, from: value === 'custom' ? from : '', to: value === 'custom' ? to : '' })}/>}
    {usesPeriod && period === 'custom' && <div className="production-report-custom-dates">
      <label className="production-report-field"><span>From</span><input type="date" value={from} max={to}
        onChange={event => { if (event.currentTarget.value) update({ from: event.currentTarget.value }); }}/></label>
      <label className="production-report-field"><span>To</span><input type="date" value={to} min={from}
        onChange={event => { if (event.currentTarget.value) update({ to: event.currentTarget.value }); }}/></label>
    </div>}
    {usesLocations && (locations.length ? <ProductionLocationFilter key={region} options={locations} value={selectedLocations}
      change={ids => update({ locations: ids.join(',') })}/>
      : <div className="production-report-field"><span>Locations</span><strong>{locationSummary}</strong></div>)}
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
