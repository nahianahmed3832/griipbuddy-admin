import Link from 'next/link';
import { adminPath } from '@/lib/paths';
import { ApiError, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { counterConfiguration, mayConfigureCounter } from '@/lib/pos-counter-configuration';
import type { Region } from '@/lib/sections';
import { CounterConfigurationForm } from './counter-configuration-form';
import styles from './counter-configuration.module.css';

export async function CounterConfiguration({ auth, region, query, production }: {
  auth: Session; region: Region; query: Query; production: boolean;
}) {
  const data = await counterConfiguration(auth);
  const market = region === 'BD' ? 'BD' : 'US';
  const outlets = data.outlets.filter(row => row.market === market);
  const selected = param(query, 'location');
  const outlet = selected ? outlets.find(row => row.location === selected) : outlets[0];
  if (selected && !outlet) throw new ApiError(404, 'This counter outlet is unavailable for the selected market.');
  const path = production ? '/dashboard/pos/counter-configuration' : '/desk/pos/counter-configuration';
  const cashier = production ? '/dashboard/pos/create' : '/desk/pos/editor';

  return <div className={styles.workspace}>
    <header><h1>Counter configuration</h1><p>Platform · {market === 'BD' ? 'Bangladesh · BDT' : 'United States · USD'} · Isolated test</p>
      <Link className="button secondary" href={url(cashier, { region })}>Open cashier</Link>
    </header>
    {!outlets.length ? <section className="panel padded"><h2>No eligible outlets</h2><p>An active outlet with an exact matching market is required.</p></section>
      : <section className="panel padded">
        <form method="get" action={adminPath(path)} className="filters">
          <input type="hidden" name="region" value={region}/>
          <label className="filter-label">Outlet<select name="location" defaultValue={outlet?.location}>
            {outlets.map(row => <option key={row.location} value={row.location}>{row.outletName}</option>)}
          </select></label>
          <button className="button secondary" type="submit">Open outlet</button>
        </form>
        {outlet && <div className={styles.details}>
          <h2>{outlet.outletName}</h2>
          <p>{outlet.enabled ? 'Enabled for synthetic cash' : 'Disabled'} · {outlet.revision ? 'Policy version ' + outlet.revision : 'Awaiting configuration'}</p>
          {mayConfigureCounter(auth, true) && <CounterConfigurationForm outlet={outlet} key={outlet.location + ':' + outlet.revision}/>}
        </div>}
      </section>}
  </div>;
}
