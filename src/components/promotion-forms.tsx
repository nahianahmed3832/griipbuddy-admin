'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { couponAmounts, couponScopes } from '@/lib/promotion-fields';

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
