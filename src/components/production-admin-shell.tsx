'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  BarChart3, Boxes, ChevronDown, ChevronRight, ClipboardList, Coins, LayoutDashboard,
  MapPin, Package, PanelLeft, ShoppingBag, ShoppingCart, Tags, Truck, Users,
  UserRoundCog, PanelsTopLeft,
} from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { catalogBeforeRegionChange } from '@/lib/connected-catalog-client';
import { superAdmin, type Region, type Staff } from '@/lib/sections';
import '@/app/sign-in/production-fonts.css';
import { ProductionFraudChecker } from './production-fraud';
import styles from './production-admin-shell.module.css';

type Entry = { label: string; path: string; permission?: string; connected?: boolean; central?: boolean; pilot?: boolean; homepage?: 'connected' | 'legacy' };
const item = (label: string, path: string, permission?: string, connected?: boolean, central?: boolean): Entry =>
  ({ label, path: '/dashboard/' + path, permission, connected, central });
const pilotItem = (label: string, path: string, permission: string): Entry =>
  ({ ...item(label, path, permission, true), pilot: true });
const homepageItem = (label: string, path: string, homepage: NonNullable<Entry['homepage']>, permission?: string): Entry =>
  ({ ...item(label, path, permission), homepage });
const navigation = [
  { title: 'Overview', groups: [
    { label: 'Dashboard', icon: LayoutDashboard, entries: [item('Overview', 'overview'), item('Fraud Checker', 'fraud-checker', 'order.view')] },
    { label: 'Reports', icon: BarChart3, entries: [
      item('All Reports', 'reports'), item('Sales Summary', 'reports/sales-summary', 'report.sales_summary.view'),
      item('Orders Needing Action', 'reports/pending-fulfilment', 'report.pending_fulfilment.view'),
      item('Stock Valuation', 'reports/stock-valuation', 'report.stock_valuation.view'),
      item('Low Stock & Reorder', 'reports/low-stock', 'report.low_stock.view'),
    ] },
  ] },
  { title: 'Sales & Orders', groups: [
    { label: 'Website Orders', icon: ShoppingBag, entries: [item('All Orders', 'orders'),
      item('Marketplace Orders', 'marketplace-orders', 'order.view', true), item('Create Order', 'create-order')] },
    { label: 'Pre-Orders', icon: ClipboardList, entries: [item('All Pre-Orders', 'pre-orders'), item('Create Pre-Order', 'pre-orders/create')] },
  ] },
  { title: 'Inventory', groups: [
    { label: 'Products', icon: Package, entries: [
      item('All Products', 'products'), item('Create Product', 'create-product'), item('Stocks Report', 'check-outlet-stocks'),
      pilotItem('Connected Products', 'products', 'product.view'), pilotItem('Connected Stock', 'check-outlet-stocks', 'stock.view'),
      item('Product Reviews', 'product-reviews'), item('Product Faqs', 'product-faqs'), item('Return Policies', 'return-policies'),
      item('All Brands', 'all-brands'), item('Countries & Currency', 'all-countries'),
      item('Approved Device Models', 'catalog-devices', 'product.view', true, true),
    ] },
    { label: 'Purchases', icon: ShoppingCart, entries: [
      item('All Purchase', 'purchase/all'), item('Default Purchase Rate', 'barcodes/default-rate'), item('Default Purchase List', 'barcodes/default-rate/all'),
    ] },
    { label: 'Smart Inventory', icon: Boxes, entries: [
      item('All Barcodes', 'barcodes'), item('Generate Barcodes', 'barcodes/generate'), item('Scan to Receive', 'barcodes/receive'),
      item('Barcode Logs', 'barcodes/logs'), item('All Purchase', 'purchase/all'),
    ] },
    { label: 'Categories & Subcategories', icon: Tags, entries: [
      item('All Categories', 'categories'), item('All Subcategories', 'sub-categories'),
      pilotItem('Connected Categories', 'categories', 'product.view'),
      item('Create Category', 'add-new-category'), item('Create Subcategory', 'add-new-sub-category'),
      item('Category Attributes', 'category-attributes', 'product.view', true),
    ] },
    { label: 'Business Locations', icon: MapPin, entries: [
      item('All Business Locations', 'business-location/all'), item('Add Business Location', 'business-location/create'),
    ] },
  ] },
  { title: 'Partners & Customers', groups: [
    { label: 'Supplier', icon: Truck, entries: [item('All Suppliers', 'suppliers/all'), item('Add Suppliers', 'suppliers/create')] },
    { label: 'Customers', icon: Users, entries: [item('All Customers', 'customers'), item('Create Customer', 'create-customer')] },
  ] },
  { title: 'Marketing', groups: [
    { label: 'Coupon', icon: Tags, entries: [item('Create Coupon', 'create-coupon'), item('All Coupons', 'coupons')] },
  ] },
  { title: 'Finance', groups: [
    { label: 'Expense & Accounting', icon: Coins, entries: [
      item('All Expenses', 'expenses'), item('Add Expense', 'create-expense'), item('Expense Report', 'expense-report'),
      item('Expense Categories', 'expense-categories'), item('Expense Subcategories', 'expense-subcategories'),
      item('Sales Channels', 'sales-channels'), item('Payment Sources', 'payment-sources'),
    ] },
  ] },
  { title: 'Content', groups: [
    { label: 'Content Management', icon: PanelsTopLeft, entries: [
      item('Header', 'header'), item('Hero Section', 'hero-section'), item('Global Offer', 'offer-page'),
      homepageItem('Homepage', 'homepage', 'connected', 'cms.view'),
      homepageItem('Shop by Category', 'homepage/shop-by-category', 'legacy'),
      homepageItem('Best Selling', 'homepage/best-selling', 'legacy'),
      homepageItem('New Arrivals', 'homepage/new-arrivals', 'legacy'),
      homepageItem('Leather Section', 'homepage/leather-section', 'legacy'),
      item('Storefront Menus', 'catalog-menus', 'product.view', true), item('Collections', 'catalog-collections', 'product.view', true),
      item('Search Maintenance', 'catalog-search', 'product.view', true, true),
    ] },
  ] },
  { title: 'Administration', groups: [
    { label: 'Manage Staffs and Roles', icon: UserRoundCog, entries: [
      item('Manage Staffs', 'staffs', 'user.view'), item('Manage Roles', 'role', 'role.view'),
    ] },
  ] },
];

function currentMenuPath(path: string) {
  if (path.startsWith('/dashboard/order-details/native-') || path.startsWith('/dashboard/marketplace-orders/cases')) return '/dashboard/marketplace-orders';
  if (path.startsWith('/dashboard/order-details/')) return '/dashboard/orders';
  if (path.startsWith('/dashboard/product-details/')) return '/dashboard/products';
  return navigation.flatMap(section => section.groups.flatMap(group => group.entries))
    .map(entry => entry.path)
    .filter(href => path === href || path.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0] ?? path;
}

const desktopViewport = '(min-width: 768px)';
function subscribeViewport(update: () => void) {
  const media = window.matchMedia(desktopViewport);
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
const isNarrowViewport = () => !window.matchMedia(desktopViewport).matches;
const isServerNarrowViewport = () => false;

export function ProductionAdminShell({ children, staff, region, path, query, readOnly, fraud, connectedCatalog, connectedHomepage, catalogPilot }: {
  children: ReactNode; staff: Pick<Staff, 'name' | 'role' | 'permissions'>; region: Region; path: string; query: string; readOnly: boolean; fraud: boolean;
  connectedCatalog?: boolean; connectedHomepage?: boolean; catalogPilot?: boolean;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [time, setTime] = useState('');
  const [notice, setNotice] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const narrow = useSyncExternalStore(subscribeViewport, isNarrowViewport, isServerNarrowViewport);
  const closeNavigation = useCallback(() => {
    restoreFocus.current = true;
    setMobile(false);
  }, []);
  const connectedLane = catalogPilot && new URLSearchParams(query).get('catalog') === 'connected';
  const current = currentMenuPath(connectedLane && path === '/dashboard/create-product' ? '/dashboard/products' : path);
  const grants = new Set(staff.permissions);
  const canSwitchRegion = grants.has('international.access');
  const regionQuery = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';
  const hasReports = staff.permissions.some(value => value.startsWith('report.'));

  useEffect(() => {
    function update() {
      setTime(new Date().toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      }).replaceAll(',', ''));
    }
    update();
    const clock = window.setInterval(update, 60000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (mobile) close.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
    function key(event: KeyboardEvent) {
      if (!mobile) return;
      if (event.key === 'Escape') {
        closeNavigation();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...document.querySelectorAll<HTMLElement>('#production-navigation a, #production-navigation button, #production-navigation select')]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const media = window.matchMedia(desktopViewport);
    function resize() { if (media.matches) setMobile(false); }
    media.addEventListener('change', resize);
    window.addEventListener('keydown', key);
    return () => {
      media.removeEventListener('change', resize);
      window.removeEventListener('keydown', key);
    };
  }, [mobile, closeNavigation]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function saved(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      setNotice(event.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(''), 5000);
    }
    window.addEventListener('griip-admin-saved', saved);
    return () => { window.removeEventListener('griip-admin-saved', saved); clearTimeout(timer); };
  }, []);

  function regionChanged(value: string) {
    if (!window.dispatchEvent(new Event(catalogBeforeRegionChange, { cancelable: true }))) return;
    const params = new URLSearchParams(query);
    if (value === 'INTERNATIONAL') params.set('region', value);
    else params.delete('region');
    params.delete('page');
    if (path.startsWith('/dashboard/homepage')) params.delete('scope');
    const search = params.toString();
    router.push(path + (search ? '?' + search : ''));
  }

  return <div className={styles.shell} data-collapsed={collapsed} data-mobile-open={mobile} data-region={region}>
    <a className="skip-link" href="#main" inert={mobile}>Skip to content</a>
    {mobile && <div className={styles.overlay} aria-hidden="true" onClick={closeNavigation}/>}
    <aside className={styles.sidebar} id="production-navigation" aria-label={mobile ? 'Navigation' : 'Sidebar'} role={mobile ? 'dialog' : undefined}
      aria-modal={mobile || undefined} inert={collapsed && !mobile}>
      <div className={styles.brand}>
        <Link href={'/dashboard/overview' + regionQuery} onClick={() => setMobile(false)}>
          <Image src={adminPath('/production-admin/griipbuddy-wordmark.png')} alt="GriipBuddy" width={300} height={100} unoptimized priority/>
        </Link>
        <button ref={close} className={styles.mobileClose} aria-label="Close navigation" onClick={closeNavigation}>×</button>
      </div>
      {canSwitchRegion && <label className={styles.market}>
        <span className={styles.srOnly}>Operating region</span>
        <select aria-label="Operating region" value={region} onChange={event => regionChanged(event.target.value)}>
          <option value="BD">🇧🇩 Bangladesh (BD)</option>
          <option value="INTERNATIONAL">🌍 International</option>
        </select>
        <ChevronDown aria-hidden="true" size={16}/>
      </label>}
      <nav className={styles.navigation} aria-label="Primary navigation">
        {navigation.map(({ title, groups }) => <section className={styles.group} key={title}>
          <div className={styles.groupTitle}>{title}</div>
          {groups.filter(group => group.label !== 'Reports' || hasReports).map(({ label, icon: Icon, entries }) => {
            const allowed = entries.filter(entry => (!entry.permission || grants.has(entry.permission)) &&
              (!entry.connected || connectedCatalog) && (!entry.central || superAdmin(staff)) &&
              (!entry.pilot || catalogPilot) &&
              (!entry.homepage || (entry.homepage === 'connected') === Boolean(connectedHomepage)));
            const currentEntry = allowed.find(entry => entry.path === current && Boolean(entry.pilot) === Boolean(connectedLane)) ??
              allowed.find(entry => entry.path === current);
            const selected = Boolean(currentEntry);
            const open = expanded[label] ?? selected;
            return <div key={label} className={styles.menugroup}>
              <button type="button" className={styles.menuButton} data-selected={selected} aria-expanded={open}
                onClick={() => setExpanded(previous => ({ ...previous, [label]: !open }))}>
                <Icon size={16} aria-hidden="true"/><span>{label}</span><ChevronRight size={16} aria-hidden="true"/>
              </button>
              {open && <ul className={styles.submenu}>
                {allowed.map(entry => <li key={entry.label} data-mobile-only={entry.path.endsWith('/fraud-checker')}>
                  <Link href={entry.path + (entry.pilot ? (regionQuery ? regionQuery + '&catalog=connected' : '?catalog=connected') : regionQuery)}
                    aria-current={entry === currentEntry ? 'page' : undefined}
                    onClick={() => { setExpanded({}); setMobile(false); }}>{entry.label}</Link>
                </li>)}
              </ul>}
            </div>;
          })}
        </section>)}
      </nav>
    </aside>
    <div className={styles.workspace} inert={mobile}>
      <header className={styles.header}>
        <div className={styles.greeting}>
          <button ref={trigger} className={styles.toggle} aria-label="Toggle Sidebar" title="Toggle Sidebar"
            aria-controls="production-navigation" aria-expanded={narrow ? mobile : !collapsed} onClick={() => {
              if (!narrow) setCollapsed(value => !value);
              else setMobile(value => !value);
            }}><PanelLeft size={16} aria-hidden="true"/></button>
          <p>Hi, {staff.name} <span>({staff.role.toLowerCase()})</span></p>
        </div>
        <div className={styles.headerActions}>
          {fraud && <ProductionFraudChecker header className={styles.fraud} resultClassName={styles.fraudResult}/>}
          <time className={styles.clock}>{time || '...'}</time>
          {!readOnly && <form method="post" action={adminPath('/api/session')}>
            <button className={styles.logout} type="submit" name="action" value="signout">Logout</button>
          </form>}
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
    </div>
    <div aria-live="polite" aria-atomic="true" className="workspace-toast">
      {notice && <><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></>}
    </div>
  </div>;
}
