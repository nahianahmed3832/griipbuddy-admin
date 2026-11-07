'use client';

import { useState } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

export function OverviewFilters({ region, selected, period, from, to, compare, currency, locations }: {
  region: Region; selected: string[]; period: string; from?: string; to?: string; compare: boolean; currency: string;
  locations: readonly { value: string; label: string }[];
}) {
  const [choice, setChoice] = useState(period);
  return <form className="panel overview-filters" action={adminPath('/desk/overview')}>
    <input type="hidden" name="region" value={region}/>
    <label>Period<select name="period" value={choice} onChange={event => setChoice(event.target.value)}>
      <option value="today">Today</option><option value="yesterday">Yesterday</option>
      <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option><option value="custom">Custom dates</option>
    </select></label>
    {choice === 'custom' && <>
      <label>From<input type="date" name="from" defaultValue={from} required/></label>
      <label>To<input type="date" name="to" defaultValue={to} required/></label>
    </>}
    {region === 'INTERNATIONAL' && <label>Currency<select name="currency" defaultValue={currency}>
      {['USD','EUR','AUD','BDT'].map(code => <option key={code}>{code}</option>)}
    </select></label>}
    {locations.length > 0 && <details className="overview-locations">
      <summary>Locations <span>{selected.length ? selected.length + ' selected' : 'All locations'}</span></summary>
      <fieldset><legend>Locations</legend>{locations.map(location => <label key={location.value}>
        <input type="checkbox" name="location" value={location.value} defaultChecked={selected.includes(location.value)}/>{location.label}
      </label>)}</fieldset>
    </details>}
    <label className="overview-compare"><input type="checkbox" name="compare" value="previous" defaultChecked={compare}/>
      Compare with previous period</label>
    <input type="hidden" name="filterApplied" value="1"/>
    <button className="button primary" type="submit">Apply filters</button>
  </form>;
}
