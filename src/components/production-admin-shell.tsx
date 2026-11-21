'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, PanelLeft, X } from 'lucide-react';
import { catalogBeforeRegionChange } from '@/lib/connected-catalog-client';
import type { ProductionNavigation } from '@/lib/production-admin-navigation';
import { superAdmin, type Region, type Staff } from '@/lib/sections';
import { SectionIcon } from './icons';
import { ProductionFraudChecker } from './production-fraud';
import { Brand } from './shell';
import { regionNames, useWorkspaceNavigation, WorkspaceAccount, WorkspaceMarket, WorkspaceNotice, WorkspaceSearch } from './workspace-chrome';
import styles from './production-admin-shell.module.css';

const overviewPath = '/dashboard/overview';
const orderPath = '/dashboard/orders';
const marketplacePath = '/dashboard/marketplace-orders';
const catalogPath = '/dashboard/products';
const stockPath = '/dashboard/check-outlet-stocks';
const regions: Region[] = ['BD', 'INTERNATIONAL'];

function currentMenuPath(path: string, navigation: ProductionNavigation) {
  if (path.startsWith('/dashboard/order-details/native-') || path.startsWith('/dashboard/marketplace-orders/cases')) return marketplacePath;
  if (path.startsWith('/dashboard/order-details/') || path.startsWith('/dashboard/orders/edit/')) return orderPath;
  if (path.startsWith('/dashboard/product-details/')) return catalogPath;
  return navigation.flatMap(section => section.groups.flatMap(group => group.entries)).map(entry => entry.path)
    .filter(href => path === href || path.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0] ?? path;
}

function legacyLink(path: string, region: Region, pilot?: boolean) {
  const params = new URLSearchParams();
  if (region === 'INTERNATIONAL') params.set('region', region);
  if (pilot) params.set('catalog', 'connected');
  return params.size ? path + '?' + params.toString() : path;
}

export function ProductionAdminShell({ children, staff, region, path, query, readOnly, fraud, catalogPilot, navigation, sectionLabel, environment, showMarket = true, profilePath }: {
  children: ReactNode; staff: Pick<Staff, 'name' | 'role' | 'permissions'>; region: Region; path: string; query: string;
  readOnly: boolean; fraud: boolean; catalogPilot: boolean; navigation: ProductionNavigation; sectionLabel: string; environment: string; showMarket?: boolean; profilePath?: string;
}) {
  const router = useRouter();
  const { mobile, collapsed, narrow, sidebar, closeButton, toggleButton, toggle, close } = useWorkspaceNavigation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const connectedLane = catalogPilot && new URLSearchParams(query).get('catalog') === 'connected';
  const current = currentMenuPath(connectedLane && path === '/dashboard/create-product' ? catalogPath : path, navigation);
  const canSwitchRegion = showMarket && staff.permissions.includes('international.access');
  const home = legacyLink(overviewPath, region);
  const entries = navigation.flatMap(section => section.groups.flatMap(group => group.entries));
  const currentEntry = entries.find(entry => entry.path === current && Boolean(entry.pilot) === Boolean(connectedLane)) ?? entries.find(entry => entry.path === current);
  const destinations = navigation.flatMap(section => section.groups.flatMap(group => group.entries.map(entry => ({
    label: entry.label, href: legacyLink(entry.path, region, entry.pilot), description: `${section.title} · ${group.label}`,
    recordSearch: [orderPath, catalogPath, stockPath].includes(entry.path) && Boolean(entry.pilot) === Boolean(connectedLane),
    skuSearch: entry.path === catalogPath,
  }))));

  function beforeRegionChange() {
    return window.dispatchEvent(new Event(catalogBeforeRegionChange, { cancelable: true }));
  }

  function regionHref(value: Region) {
    const params = new URLSearchParams(query);
    if (value === 'INTERNATIONAL') params.set('region', value);
    else params.delete('region');
    params.delete('page');
    if (path.startsWith('/dashboard/homepage')) params.delete('scope');
    const search = params.toString();
    return path + (search ? '?' + search : '');
  }

  return <div className="shell m03-admin" data-collapsed={collapsed} data-mobile-open={mobile}>
    <a className="skip-link" href="#main" inert={mobile}>Skip to content</a>
    {mobile && <div className="nav-overlay" aria-hidden="true" onClick={() => close()}/>}
    <aside ref={sidebar} className={'sidebar ' + (mobile ? 'sidebar-open' : '')} id="production-navigation"
      aria-label={mobile ? 'Navigation' : 'Sidebar'} role={mobile ? 'dialog' : undefined}
      aria-modal={mobile || undefined} inert={!mobile && (narrow || collapsed)}>
      <div className="workspace-brand-row">
        <Link className="brand-link" href={home} onClick={() => close(false)}><Brand/></Link>
        {mobile && <button ref={closeButton} className="icon-button sidebar-close" aria-label="Close navigation"
          onClick={() => close()}><X size={19} aria-hidden="true"/></button>}
      </div>
      {canSwitchRegion && <label className={styles.marketSelect}>
        <span className="sr-only">Operating region</span>
        <select value={region} onChange={event => {
          const value = event.target.value;
          if ((value === 'BD' || value === 'INTERNATIONAL') && beforeRegionChange()) router.push(regionHref(value));
        }}>
          {regions.map(value => <option key={value} value={value}>{regionNames[value]}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true"/>
      </label>}
      <nav aria-label="Primary navigation">
        {navigation.map(({ title, groups }) => <section className="nav-group" key={title}>
          <div className="nav-label">{title}</div>
          {groups.map(({ label, icon, entries }) => {
            const selected = Boolean(currentEntry && entries.includes(currentEntry));
            const open = expanded[label] ?? selected;
            const first = entries[0];
            if (entries.length === 1) return <Link key={label} href={legacyLink(first.path, region, first.pilot)}
              aria-current={selected ? 'page' : undefined} onClick={() => close(false)}><SectionIcon name={icon}/><span>{first.label}</span></Link>;
            return <div key={label}>
              <button type="button" className={styles.menuButton} data-selected={selected} aria-expanded={open}
                onClick={() => setExpanded(previous => ({ ...previous, [label]: !open }))}>
                <SectionIcon name={icon}/><span>{label}</span><ChevronRight size={14} aria-hidden="true"/>
              </button>
              {open && <ul className={styles.submenu}>
                {entries.map(entry => <li key={entry.label}>
                  <Link href={legacyLink(entry.path, region, entry.pilot)} aria-current={entry === currentEntry ? 'page' : undefined}
                    onClick={() => { setExpanded({}); close(false); }}>{entry.label}</Link>
                </li>)}
              </ul>}
            </div>;
          })}
        </section>)}
      </nav>
      <div className="sidebar-foot"><span className="environment-dot" aria-hidden="true"/>{environment}</div>
    </aside>
    <div className="workspace" inert={mobile}>
      <header className="topbar">
        <button ref={toggleButton} type="button" className="icon-button workspace-nav-toggle" aria-label={narrow ? 'Open navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-controls="production-navigation" aria-expanded={narrow ? mobile : !collapsed} onClick={toggle}>
          <PanelLeft size={19} aria-hidden="true"/>
        </button>
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href={home} className="workspace-context">{superAdmin(staff) ? 'Core workspace' : 'Market workspace'}</Link>
          <ChevronRight size={14} aria-hidden="true"/>
          <strong aria-current="page">{currentEntry?.label ?? sectionLabel}</strong>
        </nav>
        <WorkspaceSearch destinations={destinations} suspended={mobile}/>
        <div className="header-actions">
          {fraud && <ProductionFraudChecker header className={styles.fraud} resultClassName={styles.fraudResult}/>}
          {showMarket && <WorkspaceMarket region={region} canSwitch={canSwitchRegion} hrefForRegion={regionHref} beforeSwitch={beforeRegionChange}/>}
          <WorkspaceAccount staff={staff} readOnly={readOnly} profilePath={profilePath}/>
        </div>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>
        {readOnly && <p className="notice">Read-only workspace · Sample data</p>}{children}
      </main>
    </div>
    <WorkspaceNotice/>
  </div>;
}
