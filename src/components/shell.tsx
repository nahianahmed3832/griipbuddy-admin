'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import icon from '@/app/icon.png';
import { ArrowRight, Bell, ChevronDown, Command, LogOut, Menu, Search, X } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import type { Region, Section, Staff } from '@/lib/sections';
import { SectionIcon } from './icons';

type Nav = Pick<Section,'id'|'label'|'group'|'icon'|'description'>;
export type Destination = { label: string; href: string; description?: string; recordSearch?: boolean; skuSearch?: boolean };
const groups = ['Workspace','Commerce','Operations','Storefront','Administration'];

export function Brand() {
  return <span className="brand"><Image className="brand-icon" src={icon} width={38} height={38} alt="" unoptimized/><span>GriipBuddy<small>Commerce Admin</small></span></span>;
}

export function Shell({ section, nav, staff, region, regionPath, environment, readOnly, international, destinations, reportLinks, activeReport, children }: {
  section: Nav; nav: Nav[]; staff: Pick<Staff,'name'|'role'>; region: Region; regionPath: string; environment: string; readOnly?: boolean; international: boolean; destinations: Destination[];
  reportLinks: (Destination & {id:string})[]; activeReport?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const initials = staff.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const term = query.trim().slice(0,80);
  const results = destinations.filter(item => (item.label + ' ' + (item.description ?? '')).toLowerCase().includes(term.toLowerCase())).slice(0, 12);
  const recordSearches = term.length >= 2 ? destinations.filter(item => item.recordSearch) : [];
  const regionQuery = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';

  function openSearch() {
    setQuery('');
    dialog.current?.showModal();
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!dialog.current?.open) openSearch();
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trigger = menu.current;
    sidebar.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    const desktop = window.matchMedia('(min-width: 851px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => { desktop.removeEventListener('change', closeOnDesktop); trigger?.focus(); };
  }, [open]);

  return <div className="shell">
    <a className="skip-link" href="#main">Skip to content</a>
    {open && <div className="nav-overlay" aria-hidden="true" onClick={() => setOpen(false)} />}
    <aside ref={sidebar} className={'sidebar ' + (open ? 'sidebar-open' : '')} id="navigation" role={open ? 'dialog' : undefined}
      aria-modal={open || undefined} aria-label={open ? 'Navigation' : undefined} onKeyDown={event => {
        if (!open || event.key !== 'Tab') return;
        const nodes = event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]');
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      {open && <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={19}/></button>}
      <Link className="brand-link" href={'/desk/overview' + regionQuery} onClick={() => setOpen(false)}><Brand /></Link>
      <nav aria-label="Primary navigation">
        {groups.map(group => nav.some(item => item.group === group) && <div className="nav-group" key={group}>
          <div className="nav-label">{group}</div>
          {nav.filter(item => item.group === group).map(item => <div key={item.id}>
            <Link href={'/desk/' + item.id + regionQuery}
              aria-current={section.id === item.id && !activeReport ? 'page' : undefined} onClick={() => setOpen(false)}>
              <SectionIcon name={item.icon}/><span>{item.label}</span>
            </Link>
            {item.id === 'reports' && section.id === 'reports' && reportLinks.length > 0 &&
              <ul className="report-sidebar-links">
                <li><Link href={'/desk/reports' + regionQuery} onClick={() => setOpen(false)}>All Reports</Link></li>
                {reportLinks.map(report => <li key={report.id}><Link href={report.href}
                  aria-current={activeReport === report.id ? 'page' : undefined} onClick={() => setOpen(false)}>{report.label}</Link></li>)}
              </ul>}
          </div>)}
        </div>)}
      </nav>
      <div className="sidebar-foot"><span className="environment-dot" />{environment}<span className="stage-tag">DEV</span></div>
    </aside>
    <div className="workspace" inert={open}>
      <header className="topbar">
        <button ref={menu} type="button" aria-label="Open navigation" aria-expanded={open} aria-controls="navigation" className="icon-button mobile-menu" onClick={() => setOpen(true)}><Menu size={21}/></button>
        <div className="crumb"><span>Workspace</span><span className="slash">/</span><strong>{section.label}</strong></div>
        <button className="global-search" type="button" aria-label="Search workspace" onClick={openSearch}><Search size={17}/><span>Search workspace</span><kbd><Command size={11}/> K</kbd></button>
        <div className="header-actions">
          {international ? <details className="header-menu"><summary aria-label={'Operating region: ' + (region === 'BD' ? 'Bangladesh' : 'International')}><SectionIcon name="markets" size={16}/><span className="market-label">{region === 'BD' ? 'Bangladesh' : 'International'}</span><ChevronDown size={14}/></summary>
            <div className="header-pop"><strong>Operating region</strong>{(['BD', 'INTERNATIONAL'] as const).map(value => <Link key={value}
              href={regionPath + (value === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '')} aria-current={region === value ? 'true' : undefined}
              onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>{value === 'BD' ? 'Bangladesh' : 'International'}</Link>)}</div>
          </details> : <span className="market-chip"><SectionIcon name="markets" size={16}/><span className="market-label">Bangladesh</span></span>}
          <Link className="icon-button notification" aria-label="Operational alerts" href={'/desk/overview' + regionQuery + '#work-queue'}><Bell size={18}/></Link>
          <details className="header-menu account-menu"><summary aria-label="Account menu"><span className="avatar">{initials}</span><span className="account-label">{staff.name}<small>{staff.role.replaceAll('_', ' ')}</small></span><ChevronDown size={13}/></summary>
            <div className="header-pop"><strong>{staff.name}</strong><small>{staff.role.replaceAll('_',' ')}</small>
              {!readOnly && <form method="post" action={adminPath('/api/session')}><button className="button subtle" name="action" value="signout"><LogOut size={15}/> Sign out</button></form>}
            </div>
          </details>
        </div>
      </header>
      <main id="main" className="main-content">{readOnly && <p className="notice">Public preview · Read-only sample data</p>}{children}</main>
      <footer className="workspace-footer"><span>GriipBuddy Admin</span><span>{environment} · synthetic records</span></footer>
    </div>
    <dialog className="search-dialog" ref={dialog} aria-label="Search workspace">
      <form method="dialog"><button className="icon-button search-close" aria-label="Close workspace search"><X size={19}/></button></form>
      <label htmlFor="workspace-search"><Search size={20}/> Search workspace</label>
      <input id="workspace-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Find modules or enter a record reference…" />
      <div className="search-results">
        {recordSearches.map(item => <Link key={item.href + '-query'} href={item.href + '&q=' + encodeURIComponent(term)}
          onClick={() => dialog.current?.close()}><div><strong>Search {item.label.toLowerCase()}</strong><small>{term}</small></div><Search size={15}/></Link>)}
        {recordSearches.filter(item => item.skuSearch).map(item => <Link key={item.href + '-sku'}
          href={item.href + '&searchBy=sku&q=' + encodeURIComponent(term)} onClick={() => dialog.current?.close()}>
          <div><strong>Search product SKUs</strong><small>{term}</small></div><Search size={15}/></Link>)}
        {results.map(item => <Link key={item.href} href={item.href} onClick={() => dialog.current?.close()}><div><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</div><ArrowRight size={16}/></Link>)}
        {!results.length && !recordSearches.length && <p>No matching modules.</p>}
      </div>
    </dialog>
  </div>;
}
