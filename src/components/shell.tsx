'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, ChevronDown, ChevronRight, PanelLeft, Search, ShoppingCart, X } from 'lucide-react';
import type { ReactNode } from 'react';
import icon from '@/app/icon.png';
import { catalogBeforeRegionChange } from '@/lib/connected-catalog-client';
import { superAdmin, type Region, type Section, type Staff } from '@/lib/sections';
import { SectionIcon } from './icons';
import {
  useWorkspaceNavigation, WorkspaceAccount, WorkspaceMarket, WorkspaceNotice, WorkspaceSearch, type Destination,
} from './workspace-chrome';

export type { Destination } from './workspace-chrome';
type Nav = Pick<Section, 'id' | 'label' | 'group' | 'icon' | 'description'>;
const groups = ['Workspace', 'Commerce', 'Operations', 'Storefront', 'Administration'];

export function Brand() {
  return <span className="brand"><Image className="brand-icon" src={icon} width={38} height={38} alt="" unoptimized/>
    <span>GriipBuddy<small>Commerce Admin</small></span></span>;
}

export function Shell({ section, nav, staff, region, regionPath, environment, readOnly, fraud, international, destinations,
  reportLinks, activeReport, purchaseLinks, activePurchase, children, showMarket = true }: {
  section: Nav; nav: Nav[]; staff: Pick<Staff, 'name' | 'role' | 'permissions'>; region: Region; regionPath: string;
  environment: string; readOnly?: boolean; fraud?: boolean; international: boolean; destinations: Destination[]; showMarket?: boolean;
  reportLinks: (Destination & { id: string })[]; activeReport?: string;
  purchaseLinks: (Destination & { id: string })[]; activePurchase?: string; children: ReactNode;
}) {
  const { mobile, collapsed, narrow, sidebar, toggleButton, closeButton, toggle, close } = useWorkspaceNavigation();
  const regionQuery = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';
  const hasOverview = nav.some(item => item.id === 'overview');
  const alerts = hasOverview ? '/desk/overview' + regionQuery + '#work-queue' : '/desk/operations/queue' + regionQuery;
  const home = '/desk/' + (hasOverview ? 'overview' : 'operations') + regionQuery;

  return <div className="shell m03-admin" data-collapsed={collapsed} data-mobile-open={mobile}>
    <a className="skip-link" href="#main" inert={mobile}>Skip to content</a>
    {mobile && <div className="nav-overlay" aria-hidden="true" onClick={() => close()}/>}
    <aside ref={sidebar} className={'sidebar ' + (mobile ? 'sidebar-open' : '')} id="navigation"
      role={mobile ? 'dialog' : undefined} aria-modal={mobile || undefined} aria-label={mobile ? 'Navigation' : 'Sidebar'}
      inert={!mobile && (narrow || collapsed)}>
      <div className="workspace-brand-row">
        <Link className="brand-link" href={home} onClick={() => close(false)}><Brand/></Link>
        {mobile && <button className="icon-button sidebar-close" ref={closeButton} aria-label="Close navigation"
          onClick={() => close()}><X size={19} aria-hidden="true"/></button>}
      </div>
      <nav aria-label="Primary navigation">
        {groups.map(group => nav.some(item => item.group === group) && <div className="nav-group" key={group}>
          <div className="nav-label">{group}</div>
          {nav.filter(item => item.group === group).map(item => <div key={item.id}>
            <Link href={'/desk/' + item.id + regionQuery}
              aria-current={section.id === item.id && !activeReport && !activePurchase ? 'page' : undefined} onClick={() => close(false)}>
              <SectionIcon name={item.icon}/><span>{item.label}</span>
            </Link>
            {item.id === 'inventory' && purchaseLinks.length > 0 && <details className="purchase-nav" open={Boolean(activePurchase)}>
              <summary><ShoppingCart size={17} aria-hidden="true"/><span>Purchases</span><ChevronDown size={15} aria-hidden="true"/></summary>
              <ul className="report-sidebar-links">
                {purchaseLinks.map(link => <li key={link.id}><Link href={link.href}
                  aria-current={activePurchase === link.id ? 'page' : undefined} onClick={() => close(false)}>{link.label}</Link></li>)}
              </ul>
            </details>}
            {item.id === 'reports' && section.id === 'reports' && reportLinks.length > 0 &&
              <ul className="report-sidebar-links">
                <li><Link href={'/desk/reports' + regionQuery} onClick={() => close(false)}>All Reports</Link></li>
                {reportLinks.map(report => <li key={report.id}><Link href={report.href}
                  aria-current={activeReport === report.id ? 'page' : undefined} onClick={() => close(false)}>{report.label}</Link></li>)}
              </ul>}
          </div>)}
        </div>)}
      </nav>
      <div className="sidebar-foot"><span className="environment-dot" aria-hidden="true"/>{environment}</div>
    </aside>
    <div className="workspace" inert={mobile}>
      <header className="topbar">
        <button ref={toggleButton} type="button" aria-label={narrow ? 'Open navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={narrow ? mobile : !collapsed} aria-controls="navigation" className="icon-button workspace-nav-toggle"
          onClick={toggle}><PanelLeft size={19} aria-hidden="true"/></button>
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href={home} className="workspace-context">{superAdmin(staff) ? 'Core workspace' : 'Market workspace'}</Link>
          <ChevronRight size={14} aria-hidden="true"/>
          <strong aria-current="page">{activePurchase ? 'Purchases' : section.label}</strong>
        </nav>
        <WorkspaceSearch destinations={destinations} suspended={mobile}/>
        <div className="header-actions">
          {showMarket && <WorkspaceMarket region={region} canSwitch={international}
            hrefForRegion={value => regionPath + (value === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '')}
            beforeSwitch={() => window.dispatchEvent(new Event(catalogBeforeRegionChange, { cancelable: true }))}/>}
          {fraud && <Link className="icon-button notification" aria-label="Fraud checker" title="Fraud checker"
            href={'/desk/orders/fraud-check' + regionQuery}><Search size={17} aria-hidden="true"/></Link>}
          <Link className="icon-button notification" aria-label="Operational alerts" href={alerts}><Bell size={18} aria-hidden="true"/></Link>
          <WorkspaceAccount staff={staff} readOnly={readOnly}/>
        </div>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>{readOnly && <p className="notice">Read-only workspace · Sample data</p>}{children}</main>
    </div>
    <WorkspaceNotice/>
  </div>;
}
