import Link from 'next/link';
import { ArrowUpRight, BookOpen, LockKeyhole, Search } from 'lucide-react';
import { legacyUrl, url, type Session } from '@/lib/api';
import { param, permitted, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { canOperate, type OperationId } from '@/lib/operations';
import { workflowRoutes } from '@/lib/workflows';
import { resources, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { Empty } from './tables';

const nativeWorkflows: Record<string, { action: OperationId; href: string }> = {
  'barcodes/generate': { action: 'barcode-generate', href: '/desk/inventory/generate-barcodes' },
  'barcodes/receive': { action: 'barcode-receive', href: '/desk/inventory/scan-to-receive' },
  'barcodes/default-rate': { action: 'purchase-rate', href: '/desk/catalog/variants' },
  'suppliers/create': { action: 'supplier-create', href: '/desk/inventory/suppliers' },
  'stock-adjustment/create': { action: 'stock-adjust', href: '/desk/inventory/stock' },
  'stock-transfer/create': { action: 'stock-transfer', href: '/desk/inventory/stock' },
  'create-coupon': { action: 'coupon-create', href: '/desk/marketing/coupons' },
  'header': { action: 'announcement-create', href: '/desk/content/announcements' },
};

export function WorkflowLibrary({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  const workspaceRoutes = new Map([
    ['overview','/desk/overview'],
    ['reports','/desk/reports'],
    ...Object.entries(resources).flatMap(([section, views]) => Object.entries(views)
      .filter(([,resource]) => resource.legacy && permitted(resource, auth))
      .map(([view, resource]) => [resource.legacy!, '/desk/' + section + '/' + view])),
  ].reverse().map(([legacy, path]) => [legacy, url(path, { region })]));
  const search = (param(q,'q') ?? '').trim().toLowerCase().slice(0,80);
  const entries = workflowRoutes(auth.staff);
  const matches = entries.filter(entry => (entry.name + ' ' + entry.group).toLowerCase().includes(search));
  const groups = [...new Set(matches.map(entry => entry.group))];
  return <>
    <PageHeading eyebrow="ADMINISTRATION / COMPATIBILITY" title="Workflow library" description="Find preserved actions and screens, including those outside the original sidebar."/>
    <div className="notice"><BookOpen size={17}/> Legacy links use the preserved staff session. Routes that need a record ID can be reached from their parent list.</div>
    <form className="panel filters" action={adminPath('/desk/workflows')}><input type="hidden" name="region" value={region}/><label className="search-input"><Search size={16}/><input name="q" defaultValue={search} aria-label="Search workflows" placeholder="Search routes or modules"/></label>
      <button className="button primary">Search</button><Link href={url("/desk/workflows",{region})} className="button subtle">Reset</Link><span className="muted">{matches.length} routes</span></form>
    {groups.map(group => <section className="panel workflow-panel" key={group}>
      <div className="panel-header"><div><h2>{group}</h2><p>{matches.filter(entry => entry.group === group).length} routes</p></div></div>
      <div className="workflow-grid">{matches.filter(entry => entry.group === group).map(entry => {
        const href = !entry.dynamic && !entry.blocked && legacyUrl(entry.name);
        const native = nativeWorkflows[entry.name];
        const workspace = native && canOperate(auth.staff, native.action) ? url(native.href,{region}) : workspaceRoutes.get(entry.name);
        return <div key={entry.name} className="workflow-row"><span>{entry.name.replaceAll('-', ' ')}</span>
          <span className="workflow-links">
            {workspace && <Link href={workspace}>Workspace view</Link>}
            {href && <a href={href} target="_blank" rel="noreferrer">Legacy <ArrowUpRight size={14}/></a>}
            {!workspace && !href && <small>{entry.blocked ? 'Provider access blocked' : entry.dynamic ? 'Record required' : 'Reference only'}</small>}
          </span>
        </div>;
      })}</div>
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
          <dt>CMS and SEO</dt><dd>CMS in preserved workflows. SEO configuration in the storefront.</dd></dl>
      </section>
    </div>
  </>;
}
