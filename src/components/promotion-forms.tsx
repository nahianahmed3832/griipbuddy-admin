'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { RefreshCcw, X } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { couponAmounts, couponScopes } from '@/lib/promotion-fields';
import offerStyles from './production-offer.module.css';

type Fields = Record<string, string | boolean>;
type Result = { message: string; ok: boolean };

function usePromotionSave() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>();
  async function submit(action: string, values?: unknown, id?: string) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setResult(undefined);
    try {
      const response = await fetch(adminPath('/api/promotion-settings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, values, id }),
      });
      const data = await response.json().catch(() => ({}));
      setResult({ ok: response.ok, message: response.ok ? 'Saved successfully.' : data.message ?? 'Could not save the change.' });
      return response.ok;
    } catch {
      setResult({ ok: false, message: 'The connection was interrupted. Refresh before retrying.' });
      return false;
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return { submit, pending, result };
}

const utc = (value: FormDataEntryValue | null) => typeof value === 'string' && value ? value + 'Z' : '';
function Report({ result }: { result?: Result }) {
  return result && <p className={result.ok ? 'notice' : 'notice warn'} role={result.ok ? 'status' : 'alert'}>{result.message}</p>;
}

export function CouponForm({ initial, id, writable, canDelete, back }: {
  initial: Fields; id?: string; writable: boolean; canDelete: boolean; back: string;
}) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data);
    if (await submit('save-coupon', { ...values, firstOrderOnly: data.has('firstOrderOnly'), startAt: utc(data.get('startAt')), expireAt: utc(data.get('expireAt')) }, id)) {
      router.push(back);
      router.refresh();
    }
  }
  return <form className="panel padded stack-form" onSubmit={save}>
    <fieldset className="editor-fieldset" disabled={!writable || pending}><legend>Coupon details</legend>
      <div className="editor-grid">
        <label>Code<input name="code" defaultValue={String(initial.code ?? '')} maxLength={40} pattern="[A-Za-z0-9_\-]+" required/></label>
        <label>Discount type<select name="discountType" defaultValue={String(initial.discountType ?? 'PERCENTAGE')}><option value="PERCENTAGE">Percentage</option><option value="FLAT">Fixed amount</option></select></label>
        <label>Description<textarea name="description" rows={2} maxLength={500} defaultValue={String(initial.description ?? '')}/></label>
        {couponAmounts.map(([key, label]) => <label key={key}>{label}<input name={key} type="number" min={key === 'discountValue' ? '0.01' : '0'} max="99999999"
          step={key.startsWith('usage') ? '1' : '0.01'} required={key === 'discountValue'} defaultValue={String(initial[key] ?? '')}/></label>)}
        <label>Starts at (UTC)<input name="startAt" type="datetime-local" defaultValue={String(initial.startAt ?? '')}/></label>
        <label>Expires at (UTC)<input name="expireAt" type="datetime-local" defaultValue={String(initial.expireAt ?? '')}/></label>
        <label className="checkbox"><input name="firstOrderOnly" type="checkbox" defaultChecked={initial.firstOrderOnly === true}/> First order only</label>
      </div>
    </fieldset>
    <fieldset className="editor-fieldset" disabled={!writable || pending}><legend>Eligibility</legend>
      <p>Leave a field empty to set no restriction for that field.</p>
      <div className="editor-grid">{couponScopes.map(([key, label]) => <label key={key}>{label}<textarea name={key} rows={2}
        maxLength={2600} placeholder="Separate references with spaces or commas" defaultValue={String(initial[key] ?? '')}/></label>)}</div>
    </fieldset>
    <div className="page-actions">
      {writable && <button className="button primary" disabled={pending}>{id ? 'Save coupon' : 'Create disabled coupon'}</button>}
      {id && canDelete && <button type="button" className="button secondary" disabled={pending} onClick={async () => {
        if (window.confirm('Delete this coupon from the promotion catalog?') && await submit('delete-coupon', undefined, id)) {
          router.push(back);
          router.refresh();
        }
      }}>Delete coupon</button>}
    </div>
    <Report result={result}/>
  </form>;
}

export function AnnouncementDelete({ id, back }: { id: string; back: string }) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  return <div>
    <button type="button" className="button secondary" disabled={pending} onClick={async () => {
      if (window.confirm('Delete this announcement?') && await submit('delete-announcement', undefined, id)) {
        router.push(back);
        router.refresh();
      }
    }}>Delete announcement</button>
    <Report result={result}/>
  </div>;
}

const offerHeader = [['label', 'Header label'], ['title_1', 'First heading'], ['title_2', 'Second heading'], ['description', 'Description'], ['button_label', 'Button label']] as const;
export type OfferOption = { id: string; label: string; group: string; slug: string };
export function OfferForm({ initial, writable, options, selected }: {
  initial: Fields; writable: boolean; options: { id: string; label: string }[]; selected: string[];
}) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  const [ids, setIds] = useState(selected);
  const [search, setSearch] = useState('');
  const visible = options.filter(option => option.label.toLowerCase().includes(search.toLowerCase()));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data);
    await submit('save-offer', { ...values, offer_start_date: data.get('offer_start_date') + '+06:00', applied_subcategory: ids,
      header: Object.fromEntries(offerHeader.map(([key]) => [key, data.get('header.' + key)])),
      freeDelivery: data.has('freeDelivery'), specialSaleActive: data.has('specialSaleActive'), show_timer: data.has('show_timer') });
    router.refresh();
  }
  return <form className="panel padded stack-form" onSubmit={save} onReset={() => { setIds(selected); setSearch(''); }}>
    <fieldset className="editor-fieldset" disabled={!writable || pending}><legend>Offer settings</legend>
      <div className="editor-grid">
        <label>Start time (Bangladesh)<input type="datetime-local" name="offer_start_date" required defaultValue={String(initial.offer_start_date ?? '')}/></label>
        <label>Valid for (days)<input type="number" min="1" max="3650" name="validFor" required defaultValue={String(initial.validFor ?? 1)}/></label>
        <label>Discount percentage<input type="number" min="0" max="100" step=".01" name="discountPercentage" defaultValue={String(initial.discountPercentage ?? 0)} required/></label>
        <label>Navigation label<input name="navbar_label" maxLength={20} required defaultValue={String(initial.navbar_label ?? '')}/></label>
        <label className="checkbox"><input type="checkbox" name="freeDelivery" defaultChecked={initial.freeDelivery === true}/> Free delivery</label>
        <label className="checkbox"><input type="checkbox" name="specialSaleActive" defaultChecked={initial.specialSaleActive === true}/> Offer active</label>
      </div>
    </fieldset>
    <fieldset className="editor-fieldset" disabled={!writable || pending}><legend>Offer page and timer</legend>
      <div className="editor-grid">
        <label>Page title<input name="title" maxLength={150} required defaultValue={String(initial.title ?? '')}/></label>
        {offerHeader.map(([key,label]) => <label key={key}>{label}<input name={'header.'+key} maxLength={key === 'description' ? 500 : 120} required
          defaultValue={String(initial['header.'+key] ?? '')}/></label>)}
        <label>Timer style<select name="mode" defaultValue={String(initial.mode ?? 'countdown')}><option value="countdown">Countdown</option>
          <option value="12h_timer">12-hour timer</option><option value="24h_timer">24-hour timer</option></select></label>
        <label className="checkbox"><input type="checkbox" name="show_timer" defaultChecked={initial.show_timer !== false}/> Show timer</label>
      </div>
    </fieldset>
    <fieldset className="editor-fieldset" disabled={!writable || pending}><legend>Eligible subcategories ({ids.length} selected)</legend>
      <label>Search subcategories<input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100}/></label>
      <div className="page-actions">
        <button type="button" className="button subtle" onClick={() => setIds([...new Set([...ids, ...visible.slice(0, 100).map(option => option.id)])].slice(0, 100))}>Select visible</button>
        <button type="button" className="button subtle" onClick={() => setIds(ids.filter(id => !visible.some(option => option.id === id)))}>Clear visible</button>
        <button type="button" className="button subtle" onClick={() => setIds([])}>Clear all</button>
      </div>
      <div className="editor-grid">{visible.map(option => <label key={option.id} className="checkbox">
        <input type="checkbox" checked={ids.includes(option.id)} onChange={() => setIds(ids.includes(option.id)
          ? ids.filter(id => id !== option.id) : [...ids, option.id].slice(0, 100))}/> {option.label}</label>)}</div>
      {!visible.length && <p>No matching subcategories.</p>}
    </fieldset>
    <div className="page-actions">
      {writable && <><button type="reset" className="button secondary" disabled={pending}>Reset form</button>
        <button className="button primary" disabled={pending || !ids.length}>Save offer</button></>}
    </div>
    <Report result={result}/>
  </form>;
}

const offerDefaults: Fields = {
  validFor: '7', discountPercentage: '20', freeDelivery: false, specialSaleActive: false, navbar_label: 'Special Offer',
  title: 'Hot Offers | Griipbuddy', 'header.label': 'Special Offer', 'header.title_1': 'Limited Time Offers!',
  'header.title_2': 'Discount Available Today', 'header.description': 'Grab your favorites before they are gone.',
  'header.button_label': 'Shop Now', show_timer: true, mode: 'countdown',
};

export function ProductionOfferForm({ initial, writable, options, selected }: {
  initial: Fields; writable: boolean; options: OfferOption[]; selected: string[];
}) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  const [refreshing, refresh] = useTransition();
  const [values, setValues] = useState(initial);
  const [ids, setIds] = useState(selected);
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [validation, setValidation] = useState('');
  const disabled = !writable || pending || refreshing;
  const query = search.trim().toLowerCase();
  const visible = options.filter(option => (!selectedOnly || ids.includes(option.id)) &&
    [option.label, option.group, option.slug].some(value => value.toLowerCase().includes(query)));
  const groups = new Map<string, OfferOption[]>();
  for (const option of visible) {
    const group = option.group || 'Others';
    const members = groups.get(group) ?? [];
    members.push(option);
    groups.set(group, members);
  }
  const sortedGroups = [...groups].sort(([a], [b]) => a.localeCompare(b));

  useEffect(() => {
    setValues(initial);
    setIds(selected);
  }, [initial, selected]);

  function update(key: string, next: string | boolean) {
    setValues(previous => ({ ...previous, [key]: next }));
    setValidation('');
  }

  function reset() {
    setValues({ ...offerDefaults, offer_start_date: new Date().toISOString().slice(0, 10) });
    setIds([]);
    setValidation('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!ids.length) { setValidation('Please select at least 1 subcategory'); return; }
    if (Number(values.discountPercentage) === 0 && !values.freeDelivery) {
      setValidation('At least one offer type (discount or free delivery) must be selected');
      return;
    }
    setValidation('');
    await submit('save-offer', { ...values, offer_start_date: values.offer_start_date + 'T00:00:00Z', applied_subcategory: ids,
      header: Object.fromEntries(offerHeader.map(([key]) => [key, values['header.' + key]])) });
  }

  function input(key: string, label: string, attributes: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return <label>{label}<input {...attributes} value={String(values[key] ?? '')} required
      onChange={event => update(key, event.target.value)}/></label>;
  }

  function switchField(key: string, label: string, description?: string) {
    return <label className={offerStyles.switchRow}><span>{label}{description && <small>{description}</small>}</span>
      <input className={offerStyles.switch} type="checkbox" role="switch" checked={values[key] === true}
        onChange={event => update(key, event.target.checked)}/></label>;
  }

  const saveButton = <button className={offerStyles.primary} type="submit" disabled={disabled}>Save Offer</button>;
  return <form className={offerStyles.page} onSubmit={save}>
    <header className={offerStyles.heading}><h1>Special Global Offer Management</h1><div className={offerStyles.actions}>
      <button type="button" disabled={pending || refreshing} onClick={() => refresh(() => router.refresh())}><RefreshCcw size={16}/>Refresh</button>
      <button type="button" disabled={disabled} onClick={reset}>Reset Defaults</button>{saveButton}
    </div></header>
    {validation ? <p className="notice warn" role="alert">{validation}</p> : <Report result={result}/>}
    <div className={offerStyles.layout}>
      <div className={offerStyles.column}>
        <fieldset className={offerStyles.card} disabled={disabled}>
          <h2>Offer Settings</h2><p>These settings control the offer behavior and the offer page content.</p>
          {switchField('specialSaleActive', 'Special Sale Offer Active', 'Turn this ON to show offer on website & navbar.')}
          <div className={offerStyles.fields}>
            {input('offer_start_date', 'Offer Start Date', { type: 'date' })}
            {input('validFor', 'Valid For (days)', { type: 'number', min: 1, max: 365 })}
            {input('discountPercentage', 'Discount Percentage', { type: 'number', min: 0, max: 100, step: '.01' })}
            {input('navbar_label', 'Navbar Label (max 20 chars)', { maxLength: 20 })}
          </div>
          {switchField('freeDelivery', 'Free Delivery', 'Enable free delivery for offer products.')}
          {input('title', 'SEO Title', { maxLength: 150 })}
          <div className={offerStyles.fields}>
            {input('header.label', 'Header Label', { maxLength: 80 })}
            {input('header.button_label', 'Button Label', { maxLength: 80 })}
            {input('header.title_1', 'Title Line 1', { maxLength: 120 })}
            {input('header.title_2', 'Title Line 2', { maxLength: 120 })}
          </div>
          <label>Description<textarea required placeholder="Write a simple description for customers" maxLength={500}
            value={String(values['header.description'] ?? '')} onChange={event => update('header.description', event.target.value)}/></label>
          {switchField('show_timer', 'Show Timer', 'Display countdown / timer on the offer page.')}
          <label>Timer Mode<select value={String(values.mode ?? 'countdown')} onChange={event => update('mode', event.target.value)}>
            <option value="countdown">Countdown</option><option value="12h_timer">12-hour timer</option><option value="24h_timer">24-hour timer</option>
          </select></label>
        </fieldset>
        <fieldset className={offerStyles.card} disabled={disabled}>
          <h2>Quick Actions</h2><p>Manage selections faster and safer.</p>
          <div className={offerStyles.actions}>
            <button type="button" disabled={!ids.length} onClick={() => setIds([])}>Clear All Selected</button>
            <button type="button" onClick={reset}>Reset Form</button>{saveButton}
          </div>
        </fieldset>
      </div>
      <fieldset className={`${offerStyles.card} ${offerStyles.catalog}`} disabled={pending || refreshing}>
        <div className={offerStyles.title}><div><h2>Apply Offer</h2><p>Select which subcategories will have this offer.</p></div><span>{ids.length} Selected</span></div>
        <div className={offerStyles.search}><input type="search" aria-label="Search subcategory" maxLength={100}
          placeholder="Search subcategory (Tools, Beauty, slug, category...)" value={search} onChange={event => setSearch(event.target.value)}/>
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16}/></button>}</div>
        <label className={offerStyles.switchRow}><span>Show Selected Only<small>Helpful when reviewing large lists.</small></span>
          <input className={offerStyles.switch} type="checkbox" role="switch" checked={selectedOnly} onChange={event => setSelectedOnly(event.target.checked)}/></label>
        <div className={offerStyles.actions}>
          <button type="button" disabled={disabled || !visible.length} onClick={() => setIds([...new Set([...ids, ...visible.map(option => option.id)])].slice(0, 100))}>Select All</button>
          <button type="button" disabled={disabled || !visible.length} onClick={() => setIds(ids.filter(id => !visible.some(option => option.id === id)))}>Clear Visible</button>
        </div>
        {!!ids.length && <div className={offerStyles.selected}>
          <strong>Selected Subcategories</strong><div>{ids.slice(0, 20).map(id => {
            const label = options.find(option => option.id === id)?.label ?? id;
            return <span key={id}>{label}<button type="button" aria-label={'Remove ' + label} disabled={disabled}
              onClick={() => setIds(ids.filter(value => value !== id))}><X size={12}/></button></span>;
          })}{ids.length > 20 && <small>+{ids.length - 20} more</small>}</div>
        </div>}
        <div className={offerStyles.list}>
          <div className={offerStyles.listTitle}><h3>Subcategory List</h3><p>Grouped by category</p></div>
          <div className={offerStyles.groups}>{sortedGroups.map(([name, rows]) => <section key={name}>
            <h4>{name}</h4>{rows.map(option => <label key={option.id}>
              <input type="checkbox" disabled={disabled} checked={ids.includes(option.id)} onChange={() => setIds(ids.includes(option.id)
                ? ids.filter(id => id !== option.id) : [...ids, option.id].slice(0, 100))}/>
              <span>{option.label}{option.slug && <small>{option.slug}</small>}</span>
            </label>)}
          </section>)}{!sortedGroups.length && <p className={offerStyles.empty}>No subcategories found.<br/>Try another search or turn off “Selected only”.</p>}</div>
        </div>
      </fieldset>
    </div>
  </form>;
}
