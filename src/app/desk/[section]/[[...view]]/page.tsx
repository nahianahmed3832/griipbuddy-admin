import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { api, ApiError, connection, getRegion, publicSandbox, session, url } from '@/lib/api';
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
import { CustomerCreatePage, CustomerProfilePage, CustomersPage, canCreateCustomer } from '@/components/customers-page';
import { WebsiteOrderCreatePage, WebsiteOrdersPage, canCreateWebsiteOrder } from '@/components/website-orders-page';
import { AllBarcodes, BarcodeLogs, GenerateInventoryLabels, ScanToReceive } from '@/components/smart-inventory';
import { inventoryPath, smartInventoryTabs } from '@/lib/smart-inventory';
import { AccountingPage } from '@/components/accounting-page';
import { financeRead, financeWrite } from '@/lib/accounting';
import { LocationsPage } from '@/components/locations-page';
import { StaffWorkspace } from '@/components/staff-workspace';

export const dynamic = 'force-dynamic';

export default async function Desk({ params, searchParams }: {
  params: Promise<{ section:string;view?:string[] }>; searchParams: Promise<Query>;
}) {
  const auth = await session();
  if (!auth) {
    if (publicSandbox()) return <main className="main-content"><PageHeading eyebrow="DEV PREVIEW" title="Sample workspace unavailable"
      description="Refresh to try loading the read-only dashboard again." /></main>;
    redirect('/sign-in');
  }
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
  const tabs = sectionResources.map(([key,res]) => [key, key === 'barcodes' && sectionId === 'inventory' ? 'Smart Inventory' : res.title]);
  if (sectionId === 'staff' && superAdmin(auth.staff)) tabs.splice(0, tabs.length,
    ['staff', 'Staff directory'], ['roles', 'Roles and permissions'], ['activity', 'Access activity']);
  const inventoryTabs = smartInventoryTabs(auth);
  if (sectionId === 'customers' && canCreateCustomer(auth)) tabs.splice(1, 0, ['create', 'Create customer']);
  if (sectionId === 'content' && advancedEnabled() && has(auth.staff, 'cms.view')) tabs.unshift(['workspace','Content and SEO']);
  if (sectionId === 'orders' && canCreateWebsiteOrder(auth, region)) tabs.splice(1, 0, ['create', 'Create Order']);
  if (allowCheckout) {
    if (sectionId === 'markets') tabs.push(['checkout','Storefront controls']);
    else tabs.unshift(['checkout','Checkout methods']);
  }
  const accounting = financeRead(auth.staff) || (financeWrite() && has(auth.staff, 'expense.view') && has(auth.staff, 'expense.create'));
  if (sectionId === 'payments' && accounting) tabs.push(['accounting', 'Accounting']);
  const active = view[0] ?? tabs[0]?.[0];
  const inSmartInventory = sectionId === 'inventory' && inventoryTabs.some(([key]) => key === active);
  const destinations = [...new Map(nav.flatMap(item => [
    {label:item.label,href:url('/desk/'+item.id,{region}),description:item.description},
    ...Object.entries(resources[item.id] ?? {}).filter(([,res]) => permitted(res,auth))
      .map(([key,res]) => ({label:res.title,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label})),
    ...(item.id === 'payments' && accounting ? [{label:'Accounting', href:url('/desk/payments/accounting', {region}), description:'Regional journals and HQ statements'}] : []),
    ...(item.id === 'inventory' ? inventoryTabs.map(([key, label]) => ({label, href: url(inventoryPath + '/' + key, { region }), description: 'Smart Inventory'})) : []),
  ]).map(destination => [destination.label, destination])).values()];
  const resource = active && resources[sectionId]?.[active];
  let content;
  try {
    getRegion(regionQuery,auth.staff);
    if (!nav.some(item => item.id === sectionId)) throw new ApiError(403);
    if (sectionId === 'overview' && !view.length) content = await Dashboard({auth,q,region});
    else if (sectionId === 'reports' && view.length < 2) content = await Reports({auth,id:view[0],q,region});
    else if (sectionId === 'workflows' && !view.length) content = <WorkflowLibrary auth={auth} q={q}/>;
    else if (sectionId === 'settings' && !view.length) content = <Settings auth={auth}/>;
    else if (sectionId === 'payments' && active === 'accounting' && view.length <= 1) content = await AccountingPage({ auth, q, region });
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
    else if (sectionId === 'orders' && active === 'orders' && view.length <= 1) content = await WebsiteOrdersPage({ auth, q, region });
    else if (sectionId === 'orders' && active === 'create' && view.length === 1) content = await WebsiteOrderCreatePage({ auth, region });
    else if (sectionId === 'inventory' && active === 'barcodes' && view.length <= 1) content = await AllBarcodes({ auth, q, region });
    else if (sectionId === 'inventory' && active === 'generate-barcodes' && view.length === 1) content = GenerateInventoryLabels({ auth, region });
    else if (sectionId === 'inventory' && active === 'scan-to-receive' && view.length === 1) content = await ScanToReceive({ auth, region });
    else if (sectionId === 'inventory' && active === 'barcode-logs' && view.length === 1) content = await BarcodeLogs({ auth, q, region });
    else if (sectionId === 'inventory' && active === 'warehouses') content = await LocationsPage({ auth, region, q, id: view[1] });
    else if (sectionId === 'customers' && active === 'customers') content = view[1]
      ? await CustomerProfilePage({ auth, id: view[1], q, region })
      : await CustomersPage({ auth, q, region });
    else if (sectionId === 'customers' && active === 'create' && view.length === 1) content = CustomerCreatePage({ auth, region });
    else if (sectionId === 'staff' && active && superAdmin(auth.staff)) content = await StaffWorkspace({ auth, view: active, id: view[1], q });
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
    regionPath={'/desk/' + sectionId + (view[0] && view[0] !== 'editor' ? '/' + view[0] : '')}
    readOnly={publicSandbox()} environment={connection().name} international={has(auth.staff,'international.access')} destinations={destinations}>
    {!!tabs.length && <nav className="tabs" aria-label={section.label+' views'}>{tabs.map(([key,label]) => <Link key={key}
      href={url('/desk/'+sectionId+'/'+key,{region})} aria-current={key === active || (key === 'barcodes' && inSmartInventory) ? 'page' : undefined}>{label}</Link>)}</nav>}
    {inSmartInventory && <nav className="tabs" aria-label="Smart Inventory views">
      {inventoryTabs.map(([key, label]) => <Link key={key} href={url(inventoryPath + '/' + key, { region })}
        aria-current={key === active ? 'page' : undefined}>{label}</Link>)}
      {has(auth.staff, 'purchase.view') && <Link href={url(inventoryPath + '/purchases', { region })}>All Purchases</Link>}
    </nav>}
    {content}
  </Shell>;
}
