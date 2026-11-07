import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { api, ApiError, canWrite, connection, getRegion, integratedCheckoutEnabled, publicSandbox, session, url } from '@/lib/api';
import { param, permitted, type Query } from '@/lib/data';
import { has, resources, sections, superAdmin, visibleSections } from '@/lib/sections';
import { Dashboard, PageHeading } from '@/components/dashboard';
import { Reports, reportShortcuts } from '@/components/reports';
import { ResourceDetail, ResourcePage } from '@/components/resources';
import { ProductCatalog } from '@/components/product-catalog';
import { Shell, type Destination } from '@/components/shell';
import { Settings, WorkflowLibrary } from '@/components/workflow-library';
import { CheckoutPanel } from '@/components/checkout-panel';
import { ContentWorkspace, SaleWorkspace } from '@/components/workspace-pages';
import { CommerceMarkets, CommerceReceipts, type CommerceMarket } from '@/components/integrated-commerce';
import { advancedEnabled } from '@/lib/advanced';
import { managedProfile, managedViewsFor } from '@/lib/managed';
import { ManagedWorkspace } from '@/components/managed-workspace';
import { CategoryManager } from '@/components/category-manager';
import { canChangeCategories, loadCategories } from '@/lib/category-workspace';
import { WebsiteOrderCreatePage, WebsiteOrdersPage, canCreateWebsiteOrder } from '@/components/website-orders-page';
import { AllPurchases, DefaultRateCreatePage, DefaultRatePage, PurchaseInvoice } from '@/components/purchases';
import { purchasePath, rateFormPath, ratesPath } from '@/lib/purchases';
import { canOperate } from '@/lib/operations';

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
  const unifiedCategory = sectionId === 'catalog' && ['categories','subcategories','taxonomy'].includes(view[0] ?? '');
  const sectionResources = Object.entries(resources[sectionId] ?? {}).filter(([key,res]) => permitted(res,auth) && !(sectionId === 'catalog' && key === 'subcategories'));
  const integrated = integratedCheckoutEnabled();
  const allowCheckout = (integrated || !managedProfile()) && process.env.GRIIP_ADMIN_TARGET !== 'preview' && ['payments','markets'].includes(sectionId) && superAdmin(auth.staff);
  const managed = new Map(managedViewsFor(auth.staff, sectionId));
  const tabs = [...sectionResources.map(([key,res]) => [key,res.title]), ...managed];
  if (sectionId === 'content' && advancedEnabled() && has(auth.staff, 'cms.view')) tabs.unshift(['workspace','Content and SEO']);
  if (sectionId === 'orders' && canCreateWebsiteOrder(auth, region)) tabs.splice(1, 0, ['create', 'Create Order']);
  if (allowCheckout) {
    if (sectionId === 'markets') tabs.push(['checkout',integrated ? 'Step 9 checkout settings' : 'Storefront controls']);
    else if (sectionId === 'payments') tabs.unshift(['checkout',integrated ? 'Step 9 receipt review' : 'Checkout methods']);
  }
  const active = unifiedCategory ? 'categories' : view[0] ?? tabs[0]?.[0];
  const purchaseLinks = [
    ...(has(auth.staff, 'purchase.view') ? [{ id: 'all', label: 'All Purchases', href: url(purchasePath, { region }) }] : []),
    ...(canOperate(auth.staff, 'purchase-rate') ? [{ id: 'new', label: 'Default Purchase Rate', href: url(rateFormPath, { region }) }] : []),
    ...(has(auth.staff, 'defaults.purchase') ? [{ id: 'rates', label: 'Default Purchase List', href: url(ratesPath, { region }) }] : []),
  ];
  const activePurchase = sectionId === 'inventory'
    ? active === 'purchases' ? 'all' : active === 'rates' ? view[1] === 'new' ? 'new' : 'rates' : undefined
    : undefined;
  const reportLinks = reportShortcuts(auth.staff,region);
  const destinations = [...new Map(nav.flatMap<Destination>(item => [
    {label:item.label,href:url('/desk/'+item.id,{region}),description:item.description},
    ...(item.id === 'reports' ? reportLinks : []),
    ...Object.entries(resources[item.id] ?? {}).filter(([key,res]) => permitted(res,auth) && !(item.id === 'catalog' && key === 'subcategories'))
      .map(([key,res]) => ({
        label:res.title,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label,
        skuSearch: item.id === 'catalog' && key === 'products',
        recordSearch: Boolean(res.search) && ['orders/orders','catalog/products','inventory/stock','pos/sales'].includes(item.id+'/'+key),
      })),
    ...managedViewsFor(auth.staff,item.id)
      .map(([key,label]) => ({label,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label})),
  ]).concat(purchaseLinks.map(link => ({ ...link, description: 'Purchases' })))
    .map(destination => [destination.href, destination])).values()];
  const resource = active && resources[sectionId]?.[active];
  let content;
  try {
    getRegion(regionQuery,auth.staff);
    if (!nav.some(item => item.id === sectionId)) throw new ApiError(403);
    if (sectionId === 'overview' && !view.length) content = await Dashboard({auth,q,region});
    else if (sectionId === 'reports' && view.length < 2) content = await Reports({auth,id:view[0],q,region});
    else if (sectionId === 'workflows' && !view.length) content = <WorkflowLibrary auth={auth} q={q} region={region}/>;
    else if (sectionId === 'settings' && !view.length) content = <Settings auth={auth}/>;
    else if (unifiedCategory) {
      if (!has(auth.staff,'product.view')) throw new ApiError(403);
      if (view[0] !== 'categories' || view.length > 1) {
        redirect(url('/desk/catalog/categories',{ region, record: view[1] ?? param(q,'record') }));
      }
      const { nodes, managed: editable } = await loadCategories(auth);
      content = <CategoryManager nodes={nodes} initial={param(q,'record')}
        canCreate={editable && canChangeCategories(auth,'product.create')}
        canEdit={editable && canChangeCategories(auth,'product.update')}/>;
    }
    else if (active && managed.has(active) && view.length < 2)
      content = await ManagedWorkspace({ auth, q, region, path:'/desk/' + sectionId + '/' + active, view:active, title:managed.get(active)! });
    else if (allowCheckout && active === 'checkout' && view.length < 2) {
      if (!integrated) content = await CheckoutPanel({auth,mode:sectionId === 'markets' ? 'markets' : 'payments'});
      else if (sectionId === 'markets') content = <>
        <PageHeading eyebrow="COMMERCE / MARKETS" title="Storefront controls" description="Edit shipping and payment availability for each market."/>
        <CommerceMarkets writable={canWrite(auth.staff)} markets={await api('/commerce/admin/markets', auth.token) as CommerceMarket[]}/>
      </>;
      else content = <>
        <PageHeading eyebrow="COMMERCE / PAYMENTS" title="Checkout receipts" description="Review private evidence submitted with integrated orders."/>
        <CommerceReceipts key={param(q, 'receipt')} writable={canWrite(auth.staff)} initial={param(q, 'receipt')}/>
      </>;
    }
    else if (sectionId === 'content' && active === 'workspace' && view.length <= 1) content = await ContentWorkspace({ auth });
    else if (sectionId === 'pos' && active === 'editor') content = await SaleWorkspace({ auth, id: view[1], region });
    else if (sectionId === 'orders' && active === 'orders' && view.length <= 1) content = await WebsiteOrdersPage({ auth, q, region });
    else if (sectionId === 'orders' && active === 'create' && view.length === 1) content = await WebsiteOrderCreatePage({ auth, region });
    else if (sectionId === 'catalog' && active === 'products' && view.length <= 1) content = await ProductCatalog({ auth, q, region });
    else if (activePurchase === 'all' && !view[1]) content = await AllPurchases({ auth, q, region });
    else if (activePurchase === 'all' && view[1] && param(q, 'invoice') === '1') content = await PurchaseInvoice({ auth, region, id: view[1] });
    else if (activePurchase === 'rates' && !view[1]) content = await DefaultRatePage({ auth, q, region });
    else if (activePurchase === 'new') content = await DefaultRateCreatePage({ auth, region });
    else if (resource) content = view[1] ? await ResourceDetail({section,view:active!,resource,id:view[1],auth,region,q,
      openPurchaseEditor: activePurchase === 'all' && param(q, 'edit') === '1'})
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
    regionPath={activePurchase === 'new' ? rateFormPath : '/desk/' + sectionId + (view[0] && view[0] !== 'editor' ? '/' + view[0] : '')}
    reportLinks={reportLinks} activeReport={sectionId === 'reports' ? view[0] : undefined}
    readOnly={publicSandbox()} environment={connection().name} international={has(auth.staff,'international.access')} destinations={destinations}
    purchaseLinks={purchaseLinks} activePurchase={activePurchase}>
    {!!tabs.length && !activePurchase && <nav className="tabs" aria-label={section.label+' views'}>{tabs.map(([key,label]) => <Link key={key}
      href={url('/desk/'+sectionId+'/'+key,{region})} aria-current={key === active ? 'page' : undefined}>{label}</Link>)}</nav>}
    {content}
  </Shell>;
}
