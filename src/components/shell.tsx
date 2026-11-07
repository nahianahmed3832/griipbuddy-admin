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
export type Destination = { label: string; href: string; description?: string };
const groups = ['Workspace','Commerce','Operations','Storefront','Administration'];

export function Brand() {
  return <span className="brand"><Image className="brand-icon" src={icon} width={38} height={38} alt="" unoptimized/><span>GriipBuddy<small>Commerce Admin</small></span></span>;
}

export function Shell({ section, nav, staff, region, environment, readOnly, international, destinations, children }: {
  section: Nav; nav: Nav[]; staff: Pick<Staff,'name'|'role'>; region: Region; environment: string; readOnly?: boolean; international: boolean; destinations: Destination[]; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const initials = staff.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const results = destinations.filter(item => (item.label + ' ' + (item.description ?? '')).toLowerCase().includes(query.toLowerCase())).slice(0, 12);
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

  return <div className="shell">
    <a className="skip-link" href="#main">Skip to content</a>
    {open && <button className="nav-overlay" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={'sidebar ' + (open ? 'sidebar-open' : '')} id="navigation">
      <Link className="brand-link" href={'/desk/overview' + regionQuery} onClick={() => setOpen(false)}><Brand /></Link>
      <nav aria-label="Primary navigation">
        {groups.map(group => nav.some(item => item.group === group) && <div className="nav-group" key={group}>
          <div className="nav-label">{group}</div>
          {nav.filter(item => item.group === group).map(item => <Link key={item.id} href={'/desk/' + item.id + regionQuery}
            aria-current={section.id === item.id ? 'page' : undefined} onClick={() => setOpen(false)}>
            <SectionIcon name={item.icon}/><span>{item.label}</span>
          </Link>)}
        </div>)}
      </nav>
      <div className="sidebar-foot"><span className="environment-dot" />{environment}<span className="stage-tag">DEV</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button type="button" aria-label="Open navigation" aria-expanded={open} aria-controls="navigation" className="icon-button mobile-menu" onClick={() => setOpen(!open)}><Menu size={21}/></button>
        <div className="crumb"><span>Workspace</span><span className="slash">/</span><strong>{section.label}</strong></div>
        <button className="global-search" type="button" onClick={openSearch}><Search size={17}/><span>Search workspace</span><kbd><Command size={11}/> K</kbd></button>
        <div className="header-actions">
          {international ? <details className="header-menu"><summary><SectionIcon name="markets" size={16}/><span className="market-label">{region === 'BD' ? 'Bangladesh' : 'International'}</span><ChevronDown size={14}/></summary>
            <div className="header-pop"><strong>Operating region</strong><Link href={'/desk/' + section.id}>Bangladesh</Link><Link href={'/desk/' + section.id + '?region=INTERNATIONAL'}>International</Link></div>
          </details> : <span className="market-chip"><SectionIcon name="markets" size={16}/><span className="market-label">Bangladesh</span></span>}
          <Link className="icon-button notification" aria-label="Operational alerts" href={'/desk/overview' + regionQuery + '#work-queue'}><Bell size={18}/></Link>
          <details className="header-menu account-menu"><summary aria-label="Account menu"><span className="avatar">{initials}</span><ChevronDown size={13}/></summary>
            <div className="header-pop"><strong>{staff.name}</strong><small>{staff.role.replaceAll('_',' ')}</small>
              {!readOnly && <form method="post" action={adminPath('/api/session')}><button className="button subtle" name="action" value="signout"><LogOut size={15}/> Sign out</button></form>}
            </div>
          </details>
        </div>
      </header>
      <main id="main" className="main-content">{readOnly && <p className="notice">Public preview · Read-only sample data</p>}{children}</main>
      <footer className="workspace-footer"><span>GriipBuddy Admin</span><span>{environment} · synthetic records</span></footer>
    </div>
    <dialog className="search-dialog" ref={dialog}>
      <form method="dialog"><button className="icon-button search-close" aria-label="Close workspace search"><X size={19}/></button></form>
      <label htmlFor="workspace-search"><Search size={20}/> Search workspace</label>
      <input id="workspace-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Find orders, warehouses, reports…" />
      <div className="search-results">
        {results.length ? results.map(item => <Link key={item.href} href={item.href} onClick={() => dialog.current?.close()}><div><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</div><ArrowRight size={16}/></Link>) : <p>No matching modules.</p>}
      </div>
    </dialog>
  </div>;
}
