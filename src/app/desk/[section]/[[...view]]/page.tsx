import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { api, ApiError, connection, getRegion, session, url } from '@/lib/api';
import { param, permitted, type Query } from '@/lib/data';
import { has, resources, sections, superAdmin, visibleSections } from '@/lib/sections';
import { Dashboard, PageHeading } from '@/components/dashboard';
import { Reports } from '@/components/reports';
import { ResourceDetail, ResourcePage } from '@/components/resources';
import { Shell } from '@/components/shell';
import { Settings, WorkflowLibrary } from '@/components/workflow-library';
import { CheckoutPanel } from '@/components/checkout-panel';
import { ContentWorkspace, SaleWorkspace } from '@/components/workspace-pages';
import { CommerceMarkets, CommerceReceipts, type CommerceMarket } from '@/components/integrated-commerce';
import { advancedEnabled } from '@/lib/advanced';

export const dynamic = 'force-dynamic';

export default async function Desk({ params, searchParams }: {
  params: Promise<{ section:string;view?:string[] }>; searchParams: Promise<Query>;
}) {
  const auth = await session();
  if (!auth) redirect('/sign-in');
  const {section:sectionId,view=[]} = await params;
  const q = await searchParams;
  const section = sections.find(item => item.id === sectionId);
  if (!section || view.length > 2) notFound();
  const nav = visibleSections(auth.staff);
  const regionQuery = param(q, 'region');
  const region = regionQuery === 'INTERNATIONAL' && has(auth.staff,'international.access') ? 'INTERNATIONAL' : 'BD';
  const sectionResources = Object.entries(resources[sectionId] ?? {}).filter(([,res]) => permitted(res,auth));
  const integrated = process.env.GRIIP_ADMIN_INTEGRATED === '1';
  const allowCheckout = process.env.GRIIP_ADMIN_TARGET !== 'preview' && ['payments','markets'].includes(sectionId) && superAdmin(auth.staff);
  const tabs = sectionResources.map(([key,res]) => [key,res.title]);
  if (sectionId === 'content' && advancedEnabled() && has(auth.staff, 'cms.view')) tabs.unshift(['workspace','Content and SEO']);
  if (allowCheckout) {
    if (sectionId === 'markets') tabs.push(['checkout','Storefront controls']);
    else tabs.unshift(['checkout','Checkout methods']);
  }
  const active = view[0] ?? tabs[0]?.[0];
  const destinations = nav.flatMap(item => [
    {label:item.label,href:url('/desk/'+item.id,{region}),description:item.description},
    ...Object.entries(resources[item.id] ?? {}).filter(([,res]) => permitted(res,auth))
      .map(([key,res]) => ({label:res.title,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label})),
  ]);
  const resource = active && resources[sectionId]?.[active];
  let content;
  try {
    getRegion(regionQuery,auth.staff);
    if (!nav.some(item => item.id === sectionId)) throw new ApiError(403);
    if (sectionId === 'overview' && !view.length) content = await Dashboard({auth,q,region});
    else if (sectionId === 'reports' && view.length < 2) content = await Reports({auth,id:view[0],q,region});
    else if (sectionId === 'workflows' && !view.length) content = <WorkflowLibrary auth={auth} q={q}/>;
    else if (sectionId === 'settings' && !view.length) content = <Settings auth={auth}/>;
    else if (allowCheckout && active === 'checkout' && view.length < 2) {
      if (!integrated) content = await CheckoutPanel({auth,mode:sectionId === 'markets' ? 'markets' : 'payments'});
      else if (sectionId === 'markets') content = <>
        <PageHeading eyebrow="COMMERCE / MARKETS" title="Storefront controls" description="Edit shipping and payment availability for each market."/>
        <CommerceMarkets markets={await api('/commerce/admin/markets', auth.token) as CommerceMarket[]}/>
      </>;
      else content = <>
        <PageHeading eyebrow="COMMERCE / PAYMENTS" title="Checkout receipts" description="Review private evidence submitted with integrated orders."/>
        <CommerceReceipts initial={param(q, 'receipt')}/>
      </>;
    }
    else if (sectionId === 'content' && active === 'workspace' && view.length <= 1) content = await ContentWorkspace({ auth });
    else if (sectionId === 'pos' && active === 'editor') content = await SaleWorkspace({ auth, id: view[1], region });
    else if (resource) content = view[1] ? await ResourceDetail({section,view:active!,resource,id:view[1],auth,region})
      : await ResourcePage({section,view:active!,resource,auth,q,region});
    else if (resources[sectionId]) throw new ApiError(403);
    else throw new ApiError(404);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 404) notFound();
    const denied = error.status === 401 || error.status === 403;
    content = <><PageHeading eyebrow={section.group.toUpperCase()} title={denied ? 'Access restricted' : 'Data temporarily unavailable'}
      description={denied ? 'Your account does not have access to this view or operating region.' : 'The recovery API could not load this view.'}/>
      <div className="notice warn"><ShieldAlert size={18}/> {denied ? 'Review your permissions in Settings.' : 'Try refreshing or return to the overview.'}</div></>;
  }
  return <Shell section={section} nav={nav} staff={{name:auth.staff.name,role:auth.staff.role}} region={region}
    environment={connection().name} international={has(auth.staff,'international.access')} destinations={destinations}>
    {!!tabs.length && <nav className="tabs" aria-label={section.label+' views'}>{tabs.map(([key,label]) => <Link key={key}
      href={url('/desk/'+sectionId+'/'+key,{region})} aria-current={key === active ? 'page' : undefined}>{label}</Link>)}</nav>}
    {content}
  </Shell>;
}
