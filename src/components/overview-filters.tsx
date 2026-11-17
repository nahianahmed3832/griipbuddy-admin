'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { adminPath } from '@/lib/paths';
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
  const [choice, setChoice] = useState(period);
  return (
    <form className="production-overview-filters" action={adminPath('/dashboard/overview')}>
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="filterApplied" value="1" />
      <label>
        Period
        <span className="production-overview-select">
          <select name="period" value={choice} onChange={event => {
            const next = event.currentTarget.value;
            setChoice(next);
            if (next !== 'custom') event.currentTarget.form?.requestSubmit();
          }}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
          <ChevronDown aria-hidden="true" size={14} />
        </span>
      </label>
      <details className="production-overview-locations">
        <summary><span>Locations</span><span className="production-overview-location-control">
          {selected.length ? `${selected.length} selected` : 'All locations'}<ChevronDown aria-hidden="true" size={14} />
        </span></summary>
        <fieldset>
          <legend>Locations</legend>
          {locations.length ? locations.map(location => (
            <label key={location.value}>
              <input type="checkbox" name="location" value={location.value} defaultChecked={selected.includes(location.value)}
                onChange={event => event.currentTarget.form?.requestSubmit()} />
              {location.label}
            </label>
          )) : <span>No locations available</span>}
        </fieldset>
      </details>
      {region === 'INTERNATIONAL' && <label>
        Currency
        <span className="production-overview-select">
          <select name="currency" defaultValue={currency} onChange={event => event.currentTarget.form?.requestSubmit()}>
            {['USD', 'EUR', 'AUD', 'BDT'].map(code => <option key={code}>{code}</option>)}
          </select>
          <ChevronDown aria-hidden="true" size={14} />
        </span>
      </label>}
      <label className="production-overview-compare">
        <input type="checkbox" role="switch" name="compare" value="previous" defaultChecked={compare}
          onChange={event => event.currentTarget.form?.requestSubmit()} />
        Compare with previous period
      </label>
      {choice === 'custom' && <div className="production-overview-custom-dates">
        <label>From<input name="from" type="date" defaultValue={from} required /></label>
        <label>To<input name="to" type="date" defaultValue={to} required /></label>
        <button type="submit">Apply dates</button>
      </div>}
    </form>
  );
}
