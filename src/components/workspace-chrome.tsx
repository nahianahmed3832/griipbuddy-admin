'use client';

import Link from 'next/link';
import { ArrowRight, ChevronDown, Command, Globe2, LogOut, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region, Staff } from '@/lib/sections';

export type Destination = { label: string; href: string; description?: string; recordSearch?: boolean; skuSearch?: boolean };

const desktopViewport = '(min-width: 851px)';

function subscribeViewport(update: () => void) {
  const media = window.matchMedia(desktopViewport);
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}

const isNarrowViewport = () => !window.matchMedia(desktopViewport).matches;
const isServerNarrowViewport = () => false;

export function useWorkspaceNavigation() {
  const narrow = useSyncExternalStore(subscribeViewport, isNarrowViewport, isServerNarrowViewport);
  const [opened, setOpened] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const mobile = narrow && opened;

  const close = useCallback((restore = true) => {
    restoreFocus.current = restore && isNarrowViewport();
    setOpened(false);
  }, []);

  useEffect(() => {
    if (!mobile) {
      if (restoreFocus.current) {
        restoreFocus.current = false;
        toggleButton.current?.focus();
      }
      return;
    }
    closeButton.current?.focus();
    function containFocus(event: FocusEvent) {
      if (!sidebar.current?.contains(event.target as Node)) closeButton.current?.focus();
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button, select, summary, input, textarea, [tabindex]') ?? [])]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const media = window.matchMedia(desktopViewport);
    function resize() { if (media.matches) close(false); }
    media.addEventListener('change', resize);
    window.addEventListener('keydown', keyboard);
    window.addEventListener('focusin', containFocus);
    return () => {
      media.removeEventListener('change', resize);
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('focusin', containFocus);
    };
  }, [close, mobile]);

  function toggle() {
    if (narrow) setOpened(true);
    else setCollapsed(value => !value);
  }

  return { mobile, collapsed, narrow, sidebar, toggleButton, closeButton, toggle, close };
}

type SidebarDensity = 'standard' | 'compact';
const densityEvent = 'griip-admin-sidebar-density';
const defaultDensity = () => 'standard' as const;

function subscribeDensity(update: () => void) {
  window.addEventListener('storage', update);
  window.addEventListener(densityEvent, update);
  return () => {
    window.removeEventListener('storage', update);
    window.removeEventListener(densityEvent, update);
  };
}

export function useSidebarDensity(staffId: string) {
  const key = 'griipbuddy.admin.sidebar-density.' + staffId;
  const [temporary, setTemporary] = useState<{ key: string; value: SidebarDensity }>();
  const snapshot = useCallback((): SidebarDensity => {
    if (temporary?.key === key) return temporary.value;
    try { return window.localStorage.getItem(key) === 'compact' ? 'compact' : 'standard'; }
    catch { return 'standard'; }
  }, [key, temporary]);
  const density = useSyncExternalStore(subscribeDensity, snapshot, defaultDensity);

  function setDensity(value: SidebarDensity) {
    try {
      window.localStorage.setItem(key, value);
      setTemporary(undefined);
      window.dispatchEvent(new Event(densityEvent));
    } catch {
      setTemporary({ key, value });
    }
  }

  return { density, setDensity };
}

function useHeaderDisclosure() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismissOutside(event: Event) {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || !event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary')?.focus();
  }
  return { ref, onKeyDown };
}

function destinationSearch(href: string, term: string, sku = false) {
  const [path, query] = href.split('?', 2);
  const params = new URLSearchParams(query);
  params.set('q', term);
  if (sku) params.set('searchBy', 'sku');
  return path + '?' + params.toString();
}

export function WorkspaceSearch({ destinations, suspended = false }: { destinations: Destination[]; suspended?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const open = useCallback(() => {
    if (dialog.current?.open) return;
    setQuery('');
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (suspended || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      open();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [open, suspended]);

  const term = query.trim().slice(0, 80);
  const match = term.toLocaleLowerCase();
  const results = destinations.filter(item => (item.label + ' ' + (item.description ?? '')).toLocaleLowerCase().includes(match)).slice(0, 12);
  const recordSearches = term.length >= 2 ? destinations.filter(item => item.recordSearch).slice(0, 4) : [];
  return <>
    <button className="global-search" type="button" aria-label="Search workspace" aria-keyshortcuts="Control+K Meta+K" onClick={open}>
      <Search size={17} aria-hidden="true"/><span>Search workspace</span><kbd aria-hidden="true"><Command size={11}/> K</kbd>
    </button>
    <dialog className="search-dialog" ref={dialog} aria-label="Search workspace">
      <form method="dialog"><button className="icon-button search-close" aria-label="Close workspace search"><X size={19} aria-hidden="true"/></button></form>
      <label htmlFor="workspace-search"><Search size={18} aria-hidden="true"/> Search workspace</label>
      <input id="workspace-search" autoFocus value={query} onChange={event => setQuery(event.target.value)}
        maxLength={80} placeholder="Find a page or search records"/>
      <div className="search-results">
        {recordSearches.map(item => <Link key={item.href + '-query'} href={destinationSearch(item.href, term)}
          onClick={() => dialog.current?.close()}><div><strong>Search {item.label.toLowerCase()}</strong><small>{term}</small></div>
          <Search size={15} aria-hidden="true"/></Link>)}
        {recordSearches.filter(item => item.skuSearch).map(item => <Link key={item.href + '-sku'}
          href={destinationSearch(item.href, term, true)} onClick={() => dialog.current?.close()}>
          <div><strong>Search product SKUs</strong><small>{term}</small></div><Search size={15} aria-hidden="true"/></Link>)}
        {results.map(item => <Link key={item.href} href={item.href} onClick={() => dialog.current?.close()}>
          <div><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</div><ArrowRight size={16} aria-hidden="true"/></Link>)}
        {!results.length && !recordSearches.length && <p>No matching pages.</p>}
      </div>
    </dialog>
  </>;
}

export const regionNames: Record<Region, string> = { BD: 'Bangladesh', INTERNATIONAL: 'International' };

export function WorkspaceMarket({ region, canSwitch, hrefForRegion, beforeSwitch }: {
  region: Region; canSwitch: boolean; hrefForRegion: (region: Region) => string; beforeSwitch?: () => boolean;
}) {
  const disclosure = useHeaderDisclosure();
  const name = regionNames[region];
  const symbol = region === 'BD' ? 'BD' : 'Intl.';
  const content = <><Globe2 size={16} aria-hidden="true"/><span className="workspace-market-name">{name}</span>
    <span className="workspace-market-short" aria-hidden="true">{symbol}</span></>;
  if (!canSwitch) return <span className="market-chip" aria-label={'Operating region: ' + name}>{content}</span>;

  function choose(event: MouseEvent<HTMLAnchorElement>) {
    if (beforeSwitch && !beforeSwitch()) { event.preventDefault(); return; }
    event.currentTarget.closest('details')?.removeAttribute('open');
  }

  return <details className="header-menu workspace-market" {...disclosure}>
    <summary aria-label={'Operating region: ' + name}>{content}<ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="header-pop">
      <strong>Operating region</strong>
      {(['BD', 'INTERNATIONAL'] as const).map(value => <Link key={value} href={hrefForRegion(value)} onClick={choose}
        aria-current={region === value ? 'true' : undefined}>{regionNames[value]}</Link>)}
    </div>
  </details>;
}

export function WorkspaceAccount({ staff, readOnly, profilePath, density, setDensity }: {
  staff: Pick<Staff, 'name' | 'role'>; readOnly?: boolean; profilePath?: string;
  density: SidebarDensity; setDensity: (value: SidebarDensity) => void;
}) {
  const disclosure = useHeaderDisclosure();
  const densityId = useId();
  const initials = staff.name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase() || 'GB';
  const role = staff.role.replaceAll('_', ' ');
  return <details className="header-menu account-menu" {...disclosure}>
    <summary aria-label="Account menu"><span className="avatar" aria-hidden="true">{initials}</span>
      <span className="account-label">{staff.name}</span><ChevronDown size={13} aria-hidden="true"/></summary>
    <div className="header-pop">
      <strong>{staff.name}</strong><small>{role}</small>
      {profilePath && <Link href={profilePath} onClick={() => {
        if (disclosure.ref.current) disclosure.ref.current.open = false;
      }}>My profile</Link>}
      {!readOnly && <div className="account-density">
        <label htmlFor={densityId}>Sidebar spacing</label>
        <select id={densityId} aria-describedby={densityId + '-hint'} value={density}
          onChange={event => setDensity(event.target.value === 'compact' ? 'compact' : 'standard')}>
          <option value="standard">Standard</option>
          <option value="compact">Compact</option>
        </select>
        <small id={densityId + '-hint'}>Saved for this account in this browser.</small>
      </div>}
      {!readOnly && <form method="post" action={adminPath('/api/session')}>
        <button className="button subtle" name="action" value="signout"><LogOut size={15} aria-hidden="true"/> Sign out</button>
      </form>}
    </div>
  </details>;
}

export function WorkspaceNotice() {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function saved(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      setNotice(event.detail);
      clearTimeout(timeout);
      timeout = setTimeout(() => setNotice(''), 5000);
    }
    window.addEventListener('griip-admin-saved', saved);
    return () => {
      window.removeEventListener('griip-admin-saved', saved);
      clearTimeout(timeout);
    };
  }, []);
  return <div aria-live="polite" aria-atomic="true" className="workspace-toast">
    {notice && <><span>{notice}</span>
      <button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}>
        <X size={15} aria-hidden="true"/>
      </button></>}
  </div>;
}
