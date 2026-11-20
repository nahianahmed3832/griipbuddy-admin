'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Database, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import { ProductionCatalogActions } from './production-catalog-actions';
import styles from './production-catalog.module.css';

export type Country = {
  id: string;
  name: string;
  code: string;
  currency: string;
  currencySymbol: string;
  flag: string;
  serial?: number;
  active: boolean;
};

const currencies = {
  BDT: ['৳', 'Bangladeshi Taka'],
  USD: ['$', 'US Dollar'],
  EUR: ['€', 'Euro'],
  AUD: ['A$', 'Australian Dollar'],
} as const;
type Currency = keyof typeof currencies;
const currencyCodes = Object.keys(currencies) as Currency[];
const currencyFor = (name: string): Currency => currencyCodes.find(code => name === code) ?? 'BDT';
const countryRoutes = {
  list: '/dashboard/all-countries',
  create: '/dashboard/create-country',
  update: '/dashboard/update-country/',
};
const scope = (path: string, region: Region) => path + (region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '');

function announce(message: string) {
  window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: message }));
}

export function ProductionCountries({ rows, region, canCreate, canEdit, canDelete }: {
  rows: Country[]; region: Region; canCreate: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function mutate(action: 'delete' | 'seed', id?: string) {
    if (busy.current || (action === 'delete' && !window.confirm('Are you sure you want to delete this country?'))) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await saveCatalog({ kind: 'countries', region, action, id, values: {} });
      announce(action === 'delete' ? 'Country deleted successfully' : 'Starter countries loaded');
      router.refresh();
    } catch {
      setError(action === 'delete' ? 'Failed to delete country' : 'Failed to load starter countries');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return <section className={styles.page}>
    <header className={styles.header}>
      <div><h1>Countries &amp; Currencies</h1><p>Manage which countries are available for international selling and which currency each uses.</p></div>
      {canCreate && <div className={styles.headerActions}>
        {!rows.length && <button type="button" className={styles.outline} disabled={saving} onClick={() => void mutate('seed')}>
          {saving ? <LoaderCircle className={styles.spinner} size={16}/> : <Database size={16}/>} Load starter countries
        </button>}
        <Link className={styles.primary} href={scope(countryRoutes.create, region)}>Add new Country</Link>
      </div>}
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.tableBorder}>
      <table className={styles.table}>
        <thead><tr>{['Country', 'Code', 'Currency', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map(row => {
          const currency = currencyFor(row.currency);
          return <tr key={row.id}>
            <td className={styles.countryName}><span><span className={styles.flag}>{row.flag || '🏳️'}</span>{row.name}</span></td>
            <td><code>{row.code}</code></td>
            <td><span className={styles.currencyBadge} data-currency={currency}>{row.currencySymbol || currencies[currency][0]} {row.currency}</span></td>
            <td><span className={styles.activeBadge} data-active={row.active}>{row.active ? 'Active' : 'Inactive'}</span></td>
            <td>{(canEdit || canDelete) && <ProductionCatalogActions label="Open menu" title="Actions">
              {close => <>{canEdit && <Link href={scope(countryRoutes.update + row.id, region)} onClick={close}>Edit</Link>}
                {canDelete && <button type="button" disabled={saving} onClick={() => {
                  close();
                  void mutate('delete', row.id);
                }}>Delete</button>}</>}
            </ProductionCatalogActions>}</td>
          </tr>;
        }) : <tr><td colSpan={5} className={styles.empty}>
          <p>No countries yet.</p><p>Add one, or click “Load starter countries”.</p>
        </td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

function CurrencySelect({ value, onChange }: { value: Currency; onChange: (value: Currency) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(currencyCodes.indexOf(value));
  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    function close(event: MouseEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  function choose(code: Currency) {
    onChange(code);
    setOpen(false);
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (!open && ['ArrowDown', 'ArrowUp'].includes(key)) {
      event.preventDefault();
      setCursor(currencyCodes.indexOf(value));
      setOpen(true);
    } else if (open) {
      if (key === 'Escape' || key === 'Tab') {
        setOpen(false);
        trigger.current?.focus();
        if (key === 'Tab') return;
      } else if (key === 'Enter' || key === ' ') choose(currencyCodes[cursor]);
      else if (key === 'ArrowDown') setCursor(current => Math.min(current + 1, currencyCodes.length - 1));
      else if (key === 'ArrowUp') setCursor(current => Math.max(current - 1, 0));
      else if (key === 'Home') setCursor(0);
      else if (key === 'End') setCursor(currencyCodes.length - 1);
      else return;
      event.preventDefault();
    }
  }
  function label(code: Currency) {
    return <span className={styles.currencyChoice}>
      <i data-currency={code} aria-hidden="true"/><strong>{code}</strong><span>{currencies[code][0]} · {currencies[code][1]}</span>
    </span>;
  }
  return <div className={styles.field} ref={ref} onKeyDown={keyboard}>
    <span id={id + '-label'}>Currency</span>
    <button className={styles.select} type="button" ref={trigger} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-labelledby={id + '-label ' + id + '-value'}
      onClick={() => { setCursor(currencyCodes.indexOf(value)); setOpen(current => !current); }}>
      <span id={id + '-value'}>{label(value)}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open && <div className={styles.currencyMenu} role="listbox" tabIndex={-1} ref={menu} id={id}
      aria-labelledby={id + '-label'} aria-activedescendant={id + '-' + currencyCodes[cursor]}>
      {currencyCodes.map((code, index) => <div key={code} id={id + '-' + code} role="option" aria-selected={value === code}
        data-highlighted={cursor === index} onMouseMove={() => setCursor(index)} onClick={() => choose(code)}>
        {label(code)}{value === code && <Check size={14} aria-hidden="true"/>}
      </div>)}
    </div>}
  </div>;
}

export function ProductionCountryMissing() {
  return <p className={styles.countryMissing}>Country not found</p>;
}

export function ProductionCountryEditor({ country, region }: { country?: Country; region: Region }) {
  const router = useRouter();
  const busy = useRef(false);
  const [name, setName] = useState(country?.name ?? '');
  const [code, setCode] = useState(country?.code ?? '');
  const [flag, setFlag] = useState(country?.flag ?? '');
  const [currency, setCurrency] = useState<Currency>(country ? currencyFor(country.currency) : 'USD');
  const [active, setActive] = useState(country?.active ?? true);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState({ name: '', code: '', save: '' });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const cleanName = name.trim(), cleanCode = code.trim();
    const nameError = cleanName ? '' : 'Country name is required';
    const codeError = /^[A-Z]{2,3}$/.test(cleanCode) ? '' : 'Code must be 2-3 letters';
    setErrors({ name: nameError, code: codeError, save: '' });
    if (nameError || codeError) return;
    busy.current = true;
    setPending(true);
    try {
      await saveCatalog({ kind: 'countries', action: 'save', id: country?.id, region, values: {
        name: cleanName, code: cleanCode, currency, flag_emoji: flag.trim(), is_active: String(active),
        ...(country?.serial === undefined ? {} : { serial: String(country.serial) }),
      } });
      announce(country ? 'Country updated successfully' : 'Country created successfully');
      router.push(scope(countryRoutes.list, region));
      router.refresh();
    } catch (issue) {
      setErrors({ name: '', code: '', save: issue instanceof Error ? issue.message : 'Failed to save country' });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <section className={styles.page}>
    <h1>{country ? 'Update Country' : 'Add New Country'}</h1>
    <form className={styles.countryForm} onSubmit={submit} noValidate>
      <div className={styles.editorGrid}>
        <label className={styles.field}>Country Name
          <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. United States" aria-invalid={Boolean(errors.name)} required/>
          {errors.name && <span className={styles.error} role="alert">{errors.name}</span>}
        </label>
        <label className={styles.field}>Country Code (ISO)
          <input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="e.g. US" aria-invalid={Boolean(errors.code)} required/>
          <span className={styles.help}>2-3 letter code, e.g. US, AU, DE</span>
          {errors.code && <span className={styles.error} role="alert">{errors.code}</span>}
        </label>
        <CurrencySelect value={currency} onChange={setCurrency}/>
        <label className={styles.field}>Flag Emoji (optional)
          <input value={flag} onChange={event => setFlag(event.target.value)} maxLength={16} placeholder="🇺🇸"/>
        </label>
      </div>
      <div className={styles.preview} data-currency={currency}>
        <span aria-hidden="true">{flag || '🏳️'}</span>
        <div><p><strong>{name || 'Country name'}</strong> <span>({code || '??'})</span></p>
          <p>Prices shown in {currencies[currency][0]} {currency} · {currencies[currency][1]}</p></div>
      </div>
      <div className={styles.switchRow}>
        <div><p id="country-status-label">Active</p><p id="country-status-help">Inactive countries are hidden from product dropdowns &amp; storefront.</p></div>
        <button className={styles.switch} type="button" role="switch" aria-checked={active}
          aria-labelledby="country-status-label" aria-describedby="country-status-help" onClick={() => setActive(prev => !prev)}><span/></button>
      </div>
      {errors.save && <p className={styles.error} role="alert">{errors.save}</p>}
      <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={pending}>
        {pending ? <><LoaderCircle size={16} className={styles.spinner}/>Processing...</> : country ? 'Update Country' : 'Create Country'}
      </button></div>
    </form>
  </section>;
}
