'use client';

import { type FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { ProductionLocationFilter } from './production-location-filter';
import { ProductionReportSelect } from './production-report-filters';
import { overviewPreset, overviewPresets } from '@/lib/overview-periods';
import type { Region } from '@/lib/sections';

type Location = { value: string; label: string };
type OverviewFilterValues = {
  region: Region;
  selected: string[];
  period: string;
  from?: string;
  to?: string;
  compare: boolean;
  currency: string;
  locations: readonly Location[];
};

export function PeriodFields({ period, from, to }: { period: string; from?: string; to?: string }) {
  const [choice, setChoice] = useState(period);
  return <>
    <label>Period<select aria-label="Period" name="period" value={choice} onChange={event => setChoice(event.target.value)}>
      <option value="today">Today</option><option value="yesterday">Yesterday</option>
      <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option><option value="custom">Custom dates</option>
    </select></label>
    {choice === 'custom' && <>
      <label>From<input type="date" name="from" defaultValue={from} required/></label>
      <label>To<input type="date" name="to" defaultValue={to} required/></label>
    </>}
  </>;
}

export function LocationField({ selected, locations }: { selected: string[]; locations: readonly Location[] }) {
  if (!locations.length) return selected.length ? <input type="hidden" name="locations" value={selected.join(',')}/> : null;
  return <details className="overview-locations">
    <summary>Locations <span>{selected.length ? selected.length + ' selected' : 'All locations'}</span></summary>
    <fieldset><legend>Locations</legend>{locations.map(location => <label key={location.value}>
      <input type="checkbox" name="location" value={location.value} defaultChecked={selected.includes(location.value)}/>{location.label}
    </label>)}</fieldset>
  </details>;
}

export function CurrencyField({ region, currency }: { region: Region; currency: string }) {
  return region === 'INTERNATIONAL' && <label>Currency<select name="currency" defaultValue={currency}>
    {['USD','EUR','AUD','BDT'].map(code => <option key={code}>{code}</option>)}
  </select></label>;
}

export function ComparisonField({ compare }: { compare: boolean }) {
  return <>
    <label className="overview-compare"><input type="checkbox" name="compare" value="previous" defaultChecked={compare}/>
      Compare with previous period</label>
    <input type="hidden" name="filterApplied" value="1"/>
  </>;
}

export function OverviewFilters(values: OverviewFilterValues & { production?: boolean }) {
  if (values.production) return <ProductionOverviewFilters {...values} />;
  const { region, selected, period, from, to, compare, currency, locations } = values;
  return <form className="panel overview-filters" action={adminPath('/desk/overview')}>
    <input type="hidden" name="region" value={region}/>
    <PeriodFields period={period} from={from} to={to}/>
    <CurrencyField region={region} currency={currency}/>
    <LocationField locations={locations} selected={selected}/>
    <ComparisonField compare={compare}/>
    <button className="button primary" type="submit">Apply filters</button>
  </form>;
}

function ProductionOverviewFilters({ region, selected, period, from, to, compare, currency, locations }: OverviewFilterValues) {
  const [choice, setChoice] = useState(overviewPreset(period));
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  function navigate(changes: Record<string, string> = {}) {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (typeof value === 'string' && value) params.append(key, value);
    }
    params.set('period', choice);
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    router.replace('/dashboard/overview?' + params, { scroll: false });
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }
  return (
    <form ref={form} className="production-overview-filters" action={adminPath('/dashboard/overview')} onSubmit={apply}>
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="filterApplied" value="1" />
      <ProductionReportSelect label="Period" name="period" value={choice} fieldClassName="production-overview-field"
        options={[...overviewPresets.map(([value, label]) => ({value, label})), ...(choice === '90' ? [{value:'90', label:'Last 90 days'}] : [])]}
        change={value => { setChoice(value); if (value !== 'custom') navigate({period:value}); }}/>
      <ProductionLocationFilter options={locations} value={selected} name="location" className="production-overview-field"
        change={values => navigate({locations:values.join(','),location:''})}/>
      {region === 'INTERNATIONAL' && <ProductionReportSelect label="Currency" name="currency" value={currency}
        fieldClassName="production-overview-field" options={['USD','EUR','AUD','BDT'].map(value => ({value,label:value}))}
        change={value => navigate({currency:value})}/>}
      <label className="production-overview-compare">
        <input type="checkbox" role="switch" name="compare" value="previous" defaultChecked={compare}
          onChange={event => event.currentTarget.form?.requestSubmit()} />
        Compare with previous period
      </label>
      {choice === 'custom' && <div className="production-overview-custom-dates">
        <label>From<input name="from" type="date" defaultValue={from} max={to} onChange={event => event.currentTarget.form?.requestSubmit()} required /></label>
        <label>To<input name="to" type="date" defaultValue={to} min={from} onChange={event => event.currentTarget.form?.requestSubmit()} required /></label>
      </div>}
    </form>
  );
}
