import Link from 'next/link';
import { BookOpen, LockKeyhole, Search } from 'lucide-react';
import { type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { workflowRoutes } from '@/lib/workflows';
import { PageHeading } from './dashboard';
import { Empty } from './tables';

export function WorkflowLibrary({ auth, q }: { auth: Session; q: Query }) {
  const search = (param(q,'q') ?? '').trim().toLowerCase().slice(0,80);
  const entries = workflowRoutes(auth.staff);
  const matches = entries.filter(entry => (entry.name + ' ' + entry.group).toLowerCase().includes(search));
  const groups = [...new Set(matches.map(entry => entry.group))];
  return <>
    <PageHeading eyebrow="ADMINISTRATION / COMPATIBILITY" title="Workflow library" description="Find current destinations for routes from the previous admin."/>
    <div className="notice"><BookOpen size={17}/> For record pages, open the directory and choose a record. Routes with an outstanding dependency or an unverified workflow are marked below.</div>
    <form className="panel filters" action={adminPath('/desk/workflows')}><label className="search-input"><Search size={16}/><input name="q" defaultValue={search} aria-label="Search workflows" placeholder="Search routes or modules"/></label>
      <button className="button primary">Search</button><Link href="/desk/workflows" className="button subtle">Reset</Link><span className="muted">{matches.length} routes</span></form>
    {groups.map(group => <section className="panel workflow-panel" key={group}>
      <div className="panel-header"><div><h2>{group}</h2><p>{matches.filter(entry => entry.group === group).length} routes</p></div></div>
      <div className="workflow-grid">{matches.filter(entry => entry.group === group).map(entry =>
        <div key={entry.name} className="workflow-row"><div><span>{entry.name.replaceAll('-', ' ')}</span>
          {entry.pending && <p className="muted"><small>{entry.pending}</small></p>}</div>
          {entry.href ? <Link href={entry.href}>{entry.dynamic ? 'Open directory' : 'Open workspace'}</Link> : <small>Not available</small>}
        </div>)}</div>
    </section>)}
    {!matches.length && <Empty title="No workflows match" detail="Try another search or check your staff permissions."/>}
  </>;
}

export function Settings({ auth }: { auth: Session }) {
  return <>
    <PageHeading eyebrow="ADMINISTRATION / WORKSPACE" title="Settings" description="Review your workspace access, integrations and storefront controls."/>
    <div className="overview-grid">
      <section className="panel"><div className="panel-header"><div><h2>Your access</h2><p>Current staff role and server permissions</p></div><LockKeyhole size={19}/></div>
        <div className="padded"><p><strong>{auth.staff.name}</strong> · {auth.staff.role.replaceAll('_',' ')}</p>
          <div className="grants">{auth.staff.permissions.map(key => <code key={key}>{key}</code>)}</div>
          {!auth.staff.permissions.length && <p className="muted">No additional permissions assigned.</p>}</div></section>
      <section className="panel"><div className="panel-header"><div><h2>Integrations</h2><p>Provider connections and configuration</p></div></div>
        <dl className="details-grid padded"><dt>Steadfast</dt><dd>Recovered adapter · simulation</dd><dt>PayPal and Stripe</dt><dd>Checkout simulator</dd>
          <dt>Credentials</dt><dd>Server-side environment</dd><dt>International fallback</dt><dd>Storefront environment setting</dd>
          <dt>CMS and SEO</dt><dd>Homepage content and SEO editors are in Storefront content.</dd></dl>
      </section>
    </div>
  </>;
}
