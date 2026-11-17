import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { api, ApiError, canWrite, connection, getRegion, integratedCheckoutEnabled, operationsEnabled, operationsOnly, publicSandbox, session, url } from '@/lib/api';
import { param, permitted, type Query } from '@/lib/data';
import { has, resources, sections, superAdmin, visibleSections } from '@/lib/sections';
import { Dashboard, PageHeading } from '@/components/dashboard';
import { ClassicDashboard } from '@/components/classic-dashboard';
import { Reports, reportShortcuts } from '@/components/reports';
import { ResourceDetail, ResourcePage } from '@/components/resources';
import { Shell, type Destination } from '@/components/shell';
import { ProductionAdminShell } from '@/components/production-admin-shell';
import { ProductionSubscription } from '@/components/production-subscription';
import { Settings, WorkflowLibrary } from '@/components/workflow-library';
import { CheckoutPanel } from '@/components/checkout-panel';
import { contentViews, ContentWorkspace, SaleWorkspace } from '@/components/workspace-pages';
import { CommerceMarkets, CommerceReceipts, type CommerceMarket } from '@/components/integrated-commerce';
import { CatalogRegistry, CategoryWorkspace, ProductWorkspace } from '@/components/catalog-workspace';
import { CouponEditor, GlobalOffer } from '@/components/promotion-pages';
import { CustomerCreatePage, CustomerProfilePage, CustomersPage, canCreateCustomer } from '@/components/customers-page';
import { PreOrdersPage } from '@/components/preorders-page';
import { WebsiteOrderCreatePage, WebsiteOrderDetailPage, WebsiteOrdersPage, canCreateWebsiteOrder } from '@/components/website-orders-page';
import { AllBarcodes, BarcodeLogs, GenerateInventoryLabels, ScanToReceive } from '@/components/smart-inventory';
import { inventoryPath, smartInventoryTabs } from '@/lib/smart-inventory';
import { AssignedOrders } from '@/components/assigned-orders';
import { FinanceRecordsPage } from '@/components/finance-records';
import { isFinanceView } from '@/lib/finance-records';
import { AccountingPage } from '@/components/accounting-page';
import { financeRead, financeWrite } from '@/lib/accounting';
import { AllPurchases, PurchaseRecordPage, DefaultRatePage, DefaultRateCreatePage } from '@/components/purchases';
import { SuppliersPage } from '@/components/suppliers-page';
import { CourierFraud } from '@/components/courier-fraud';
import { ProductionFraudPage } from '@/components/production-fraud';
import { ProductionPosReport } from '@/components/production-pos-report';
import { ProductionPosRegister } from '@/components/production-pos-register';
import { ProductionHeaderPage } from '@/components/production-header';
import { StockChangesPage } from '@/components/stock-changes-page';
import { StockReport } from '@/components/stock-report';
import { LocationsPage } from '@/components/locations-page';
import { StaffWorkspace } from '@/components/staff-workspace';
import { OperationsDesk } from '@/components/operations-desk';
import { managedProfile, managedViewsFor } from '@/lib/managed';
import { ManagedWorkspace } from '@/components/managed-workspace';
import { TransactionPage } from '@/components/transactions';
import { canReadTransactions } from '@/lib/transactions';
import { purchasePath, rateFormPath, ratesPath } from '@/lib/purchases';
import { canOperate } from '@/lib/operations';

export type DeskWorkspaceProps = {
  params: Promise<{ section: string; view?: string[] }>;
  searchParams: Promise<Query>;
};

export async function DeskWorkspace({ params, searchParams, production }: DeskWorkspaceProps & {
  production?: { path: string; query: string };
}) {
  const auth = await session();
  if (!auth) {
    if (publicSandbox()) return <main className="main-content"><PageHeading eyebrow="DEV PREVIEW" title="Sample workspace unavailable"
      description="Refresh to try loading the read-only dashboard again." /></main>;
    redirect('/sign-in');
  }
  const {section:sectionId,view=[]} = await params;
  if (operationsOnly() && sectionId !== 'operations' && !(sectionId === 'staff' && superAdmin(auth.staff))) redirect('/desk/operations');
  const q = await searchParams;
  const section = sections.find(item => item.id === sectionId);
  if (!section || view.length > 2) notFound();
  const nav = visibleSections(auth.staff).filter(item => operationsOnly()
    ? item.id === 'operations' || item.id === 'staff' : item.id !== 'operations' || operationsEnabled());
  const regionQuery = param(q, 'region');
  const region = regionQuery === 'INTERNATIONAL' && has(auth.staff,'international.access') ? 'INTERNATIONAL' : 'BD';
  const categoryView = sectionId === 'catalog' && ['categories', 'subcategories', 'taxonomy'].includes(view[0] ?? '');
  const sectionResources = Object.entries(resources[sectionId] ?? {})
    .filter(([key,res]) => permitted(res,auth) && !(sectionId === 'catalog' && key === 'subcategories'));
  const integrated = integratedCheckoutEnabled();
  const allowCheckout = (integrated || !managedProfile()) && process.env.GRIIP_ADMIN_TARGET !== 'preview' && ['payments','markets'].includes(sectionId) && superAdmin(auth.staff);
  const transactions = canReadTransactions(auth);
  const managed = new Map(managedViewsFor(auth.staff, sectionId));
  const tabs = [...sectionResources.filter(([key]) => !(sectionId === 'payments' && key === 'transactions' && transactions))
    .map(([key,res]) => [key, key === 'barcodes' && sectionId === 'inventory' ? 'Smart Inventory' : res.title]), ...managed];
  if (sectionId === 'staff' && superAdmin(auth.staff)) tabs.splice(0, tabs.length,
    ['staff', 'Staff directory'], ['roles', 'Roles and permissions'], ['activity', 'Access activity']);
  const inventoryTabs = smartInventoryTabs(auth);
  if (sectionId === 'customers' && canCreateCustomer(auth)) tabs.splice(1, 0, ['create', 'Create customer']);
  if (sectionId === 'content' && region === 'BD' && has(auth.staff, 'cms.view')) {
    tabs.push(['hero', process.env.GRIIP_ADMIN_TARGET === 'integration' ? 'Homepage carousel' : 'Hero section'], ['offer','Global offer'], ['shop-by-category','Shop by category'], ['best-selling', 'Best selling'],
      ['new-arrivals', 'New arrivals'], ['leather-section', 'Leather section'], ['featured-products', 'Featured products'], ['workspace','Content and SEO']);
  }
  const fraud = region === 'BD' && has(auth.staff, 'order.view') && !publicSandbox() && !operationsOnly();
  if (sectionId === 'orders' && fraud) tabs.push(['fraud-check', 'Fraud checker']);
  if (sectionId === 'orders' && canCreateWebsiteOrder(auth, region)) tabs.splice(1, 0, ['create', 'Create Order']);
  if (allowCheckout) {
    if (sectionId === 'markets') tabs.push(['checkout', integrated ? 'Step 9 checkout settings' : 'Storefront controls']);
    else tabs.unshift(['checkout', integrated ? 'Checkout receipts' : 'Checkout methods']);
  }
  if (sectionId === 'payments' && transactions) tabs.unshift(['transactions', 'Transactions']);
  const accounting = financeRead(auth.staff) || (financeWrite() && has(auth.staff, 'expense.view') && has(auth.staff, 'expense.create'));
  if (sectionId === 'payments' && region === 'BD' && has(auth.staff,'expense.view')) tabs.push(['expense-report', 'Expense report']);
  if (sectionId === 'orders' && has(auth.staff, 'order.view')) tabs.push(['sales-executive', 'Sales Executive']);
  if (sectionId === 'payments' && accounting) tabs.push(['accounting', 'Accounting']);
  const active = categoryView ? 'categories' : view[0] ?? tabs[0]?.[0];
  const inSmartInventory = sectionId === 'inventory' && inventoryTabs.some(([key]) => key === active);
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
    ...Object.entries(resources[item.id] ?? {})
      .filter(([key,res]) => permitted(res,auth) && !(item.id === 'catalog' && key === 'subcategories'))
      .map(([key,res]) => ({
        label:item.id === 'payments' && key === 'transactions' && transactions ? 'Transactions' : res.title,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label,
        skuSearch: item.id === 'catalog' && key === 'products',
        recordSearch: ['orders/orders','catalog/products','inventory/stock','pos/sales'].includes(item.id+'/'+key) ||
          (transactions && item.id === 'payments' && key === 'transactions'),
      })),
    ...managedViewsFor(auth.staff,item.id)
      .map(([key,label]) => ({label,href:url('/desk/'+item.id+'/'+key,{region}),description:item.label})),
    ...(item.id === 'payments' && accounting ? [{label:'Accounting', href:url('/desk/payments/accounting', {region}), description:'Regional journals and HQ statements'}] : []),
    ...(item.id === 'inventory' ? inventoryTabs.map(([key, label]) => ({label, href: url(inventoryPath + '/' + key, { region }), description: 'Smart Inventory'})) : []),
  ]).concat(purchaseLinks.map(link => ({ ...link, description: 'Purchases' })))
    .map(destination => [destination.href, destination])).values()];
  const resource = active && resources[sectionId]?.[active];
  let content;
  try {
    getRegion(regionQuery,auth.staff);
    if (!nav.some(item => item.id === sectionId)) throw new ApiError(403);
    if (sectionId === 'operations') content = await OperationsDesk({ auth, region, view, query: {
      from: param(q, 'from'), to: param(q, 'to'), q: param(q, 'q'), state: param(q, 'state'), proposal: param(q, 'proposal'),
    } });
    else if (sectionId === 'overview' && view.length === 1 && view[0] === 'classic') content = await ClassicDashboard({auth,q,region});
    else if (sectionId === 'overview' && !view.length) content = await Dashboard({auth,q,region,production:Boolean(production)});
    else if (sectionId === 'reports' && view.length < 2) content = await Reports({ auth, id: view[0], q, region, production: Boolean(production) });
    else if (sectionId === 'workflows' && !view.length) content = <WorkflowLibrary auth={auth} q={q}/>;
    else if (sectionId === 'settings' && view.length === 1 && ['current-plan','renew-subscription'].includes(view[0]) && (production || superAdmin(auth.staff))) {
      const title = view[0] === 'current-plan' ? 'Current Plan' : 'Renew Subscription';
      content = production ? <ProductionSubscription name={title}/> : <><PageHeading eyebrow="ADMINISTRATION / SUBSCRIPTION" title={title} description="Feature coming soon."/>
        <p className="notice">This feature is not available yet.</p></>;
    }
    else if (sectionId === 'settings' && !view.length) content = <Settings auth={auth}/>;
    else if (sectionId === 'payments' && active && isFinanceView(active)) content = await FinanceRecordsPage({auth,region,q,view:active,id:view[1],production:Boolean(production)});
    else if (active && managed.has(active) && view.length < 2)
      content = await ManagedWorkspace({ auth, q, region, path:'/desk/' + sectionId + '/' + active, view:active, title:managed.get(active)! });
    else if (sectionId === 'payments' && active === 'transactions' && transactions) content = await TransactionPage({ auth, q, region, id: view[1] });
    else if (sectionId === 'payments' && active === 'accounting' && view.length <= 1) content = await AccountingPage({ auth, q, region });
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
    else if (production && sectionId === 'content' && active === 'announcements' && !view[1]) {
      content = await ProductionHeaderPage({ auth, region });
    }
    else if (sectionId === 'content' && active === 'offer' && view.length === 1) content = await GlobalOffer({ auth, region, production: Boolean(production) });
    else if (sectionId === 'content' && active && (active === 'workspace' || Object.hasOwn(contentViews, active)) && view.length <= 1) {
      content = await ContentWorkspace({ auth, region, section: contentViews[active], production: Boolean(production) });
    }
    else if (sectionId === 'content' && region !== 'BD') throw new ApiError(403);
    else if (sectionId === 'catalog' && active === 'products') content = await ProductWorkspace({ auth, q, region, id: view[1], production: Boolean(production) });
    else if (sectionId === 'catalog' && active === 'taxonomy') redirect(url('/desk/catalog/categories', {region, record:view[1] ?? param(q,'record')}));
    else if (sectionId === 'catalog' && active === 'categories') {
      if (!has(auth.staff, 'product.view')) throw new ApiError(403);
      const record = view[1] ?? param(q, 'record');
      if (!production && categoryView && (view[0] !== 'categories' || view[1])) {
        redirect(url('/desk/catalog/categories', { region, record, mode: param(q, 'mode') }));
      }
      content = await CategoryWorkspace({ auth, q: { ...q, record }, region, production: Boolean(production), subcategory: view[0] === 'subcategories' });
    }
    else if (sectionId === 'catalog' && (active === 'brands' || active === 'faqs' || active === 'reviews' || active === 'policies')) {
      content = await CatalogRegistry({ auth, q, region, id: view[1], kind: active, production: Boolean(production) });
    }
    else if (sectionId === 'markets' && active === 'countries') content = await CatalogRegistry({ auth, q, region, id: view[1], kind: 'countries', production: Boolean(production) });
    else if (sectionId === 'marketing' && active === 'coupons' && view[1]) content = await CouponEditor({ auth, region, id: view[1] === 'new' ? undefined : view[1] });
    else if (production && sectionId === 'pos' && active === 'report' && view.length === 1) content = await ProductionPosReport({ auth, q, region });
    else if (production && sectionId === 'pos' && active === 'sales' && view.length === 1) content = await ProductionPosRegister({ auth, q, region });
    else if (sectionId === 'pos' && active === 'editor') content = await SaleWorkspace({ auth, id: view[1], region, production: Boolean(production) });
    else if (sectionId === 'orders' && active === 'orders') content = view[1]
      ? await WebsiteOrderDetailPage({ auth, q, region, id: view[1], productionLayout: Boolean(production) }) : await WebsiteOrdersPage({ auth, q, region, productionLayout: Boolean(production) });
    else if (sectionId === 'orders' && active === 'fraud-check' && view.length === 1 && fraud) {
      content = production ? <ProductionFraudPage/> : <><PageHeading eyebrow="COMMERCE / COURIER" title="Fraud checker" description="Review the courier’s delivery history before confirming an order."/>
        <CourierFraud enabled={process.env.GRIIP_ADMIN_FRAUD_LOOKUP === '1' && canWrite(auth.staff)}
          simulated={process.env.GRIIP_ADMIN_TARGET === 'integration' && process.env.GRIIP_ADMIN_FRAUD_LOOKUP === '1'}/></>;
    }
    else if (sectionId === 'orders' && active === 'sales-executive' && !view[1]) content = await WebsiteOrdersPage({auth, region, q, executive:true});
    else if (sectionId === 'orders' && active === 'assigned' && !view[1]) content = await AssignedOrders({auth, region, q, productionLayout: Boolean(production)});
    else if (sectionId === 'orders' && active === 'preorders') content = await PreOrdersPage({ auth, q, region, view, productionLayout: Boolean(production) });
    else if (sectionId === 'orders' && active === 'create' && view.length === 1) content = await WebsiteOrderCreatePage({ auth, region, productionLayout: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'barcodes' && view.length <= 1) content = await AllBarcodes({ auth, q, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'generate-barcodes' && view.length === 1) content = GenerateInventoryLabels({ auth, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'scan-to-receive' && view.length === 1) content = await ScanToReceive({ auth, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'barcode-logs' && view.length === 1) content = await BarcodeLogs({ auth, q, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'stock' && !view[1]) content = await StockReport({ auth, q, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && (active === 'adjustments' || active === 'transfers') && view[1] === 'create') {
      content = await StockChangesPage({ auth, region, mode: active === 'adjustments' ? 'adjustment' : 'transfer' });
    }
    else if (sectionId === 'inventory' && (active === 'outlet-update' || active === 'warehouse-update') && view.length === 1) {
      content = await StockChangesPage({auth, region, mode: active,
        productionOutlet: Boolean(production) && active === 'outlet-update', outletId: param(q, 'outlet_id')});
    }
    else if (sectionId === 'inventory' && active === 'purchases') content = view[1]
      ? await PurchaseRecordPage({auth, region, q, id: view[1]}) : await AllPurchases({ auth, region, q, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'rates' && view.length < 2) content = await DefaultRatePage({ auth, region, q, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'rates' && view[1] === 'new') content = await DefaultRateCreatePage({ auth, region, production: Boolean(production) });
    else if (sectionId === 'inventory' && active === 'suppliers') content = await SuppliersPage({auth, region, q, id: view[1], production: Boolean(production)});
    else if (sectionId === 'inventory' && active === 'warehouses') content = await LocationsPage({ auth, region, q, id: view[1] });
    else if (sectionId === 'customers' && active === 'customers') content = view[1]
      ? await CustomerProfilePage({ auth, id: view[1], q, region })
      : await CustomersPage({ auth, q, region });
    else if (sectionId === 'customers' && active === 'create' && view.length === 1) content = CustomerCreatePage({ auth, region });
    else if (sectionId === 'staff' && active && superAdmin(auth.staff)) content = await StaffWorkspace({ auth, view: active, id: view[1], q, production: Boolean(production) });
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
  if (production) return <ProductionAdminShell staff={{ name: auth.staff.name, role: auth.staff.role, permissions: auth.staff.permissions }}
    region={region} path={production.path} query={production.query}
    readOnly={publicSandbox()} fraud={fraud}>{content}</ProductionAdminShell>;
  return <Shell section={section} nav={nav} staff={{name:auth.staff.name,role:auth.staff.role}} region={region}
    reportLinks={reportLinks} activeReport={sectionId === 'reports' ? view[0] : undefined}
    purchaseLinks={purchaseLinks} activePurchase={activePurchase}
    regionPath={activePurchase === 'new' ? rateFormPath : '/desk/' + sectionId + (view[0] && view[0] !== 'editor' ? '/' + view[0] : '')}
    readOnly={publicSandbox()} environment={connection().name} fraud={fraud} international={has(auth.staff,'international.access')} destinations={destinations}>
    {!!tabs.length && !activePurchase && <nav className="tabs" aria-label={section.label+' views'}>{tabs.map(([key,label]) => <Link key={key}
      href={url('/desk/'+sectionId+'/'+key,{region})} aria-current={key === active || (key === 'barcodes' && inSmartInventory) ? 'page' : undefined}>{label}</Link>)}</nav>}
    {inSmartInventory && <nav className="tabs" aria-label="Smart Inventory views">
      {inventoryTabs.map(([key, label]) => <Link key={key} href={url(inventoryPath + '/' + key, { region })}
        aria-current={key === active ? 'page' : undefined}>{label}</Link>)}
      {has(auth.staff, 'purchase.view') && <Link href={url(inventoryPath + '/purchases', { region })}>All Purchases</Link>}
    </nav>}
    {content}
  </Shell>;
}
