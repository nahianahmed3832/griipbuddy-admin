'use client';

import { Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { RateOption } from '@/lib/purchases';
import type { Region } from '@/lib/sections';

type Choice = { value: string; label: string };
type Result = { saved: string[]; failed: { id: string; message: string }[] };
const endpoint = adminPath('/api/purchases/rates');

export function PurchaseRateForm({ suppliers, region, maxLines }: { suppliers: Choice[]; region: Region; maxLines: number }) {
  const [supplier, setSupplier] = useState(suppliers.length === 1 ? suppliers[0].value : '');
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<RateOption[]>([]);
  const [lines, setLines] = useState<RateOption[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const visible = options.filter(option => !lines.some(line => line.id === option.id));
  const showResults = open && term.trim().length >= 2;
  const activeId = showResults && visible[active] ? listId + '-' + visible[active].id : undefined;

  useEffect(() => {
    if (!supplier || term.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(endpoint + '?' + new URLSearchParams({ region, q: term }), { signal: controller.signal });
        if (!res.ok) throw new Error('Product search is temporarily unavailable.');
        const result = await res.json() as RateOption[];
        if (!controller.signal.aborted) setOptions(result);
      } catch {
        if (!controller.signal.aborted) setSearchError('Product search is temporarily unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [region, supplier, term]);

  function search(value: string, ready: boolean) {
    setTerm(value);
    setOptions([]);
    setActive(0);
    setSearchError('');
    setLoading(ready && value.trim().length >= 2);
    setOpen(ready);
  }

  function add(option: RateOption) {
    if (lines.length >= maxLines) return;
    setLines(previous => [...previous, option]);
    setMessage('');
    setError('');
    input.current?.focus();
    search('', false);
  }

  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showResults && visible[active]) add(visible[active]);
    }
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && visible.length) {
      event.preventDefault();
      setOpen(true);
      const next = open ? (active + (event.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length : 0;
      setActive(next);
      document.getElementById(listId + '-' + visible[next].id)?.scrollIntoView({ block: 'nearest' });
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !lines.length || !supplier) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier, region, lines }) });
      if (!res.ok) throw new Error(await res.text() || 'Could not save rates.');
      const result = await res.json() as Result;
      const saved = new Set(result.saved);
      setLines(previous => previous.filter(line => !saved.has(line.id)));
      if (saved.size) setMessage('Saved ' + saved.size + ' purchase ' + (saved.size === 1 ? 'rate.' : 'rates.'));
      const remaining = lines.filter(line => !saved.has(line.id));
      if (remaining.length) setError(remaining.map(line => line.sku + ' · ' +
        (result.failed.find(failure => failure.id === line.id)?.message || 'Save was unconfirmed')).join('\n'));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save rates.');
    } finally { setSaving(false); }
  }

  return <form className="purchase-rate-form" onSubmit={save}>
    <fieldset disabled={saving}>
      <section className="panel padded purchase-rate-picker">
        <label className="filter-label">Supplier
          <select value={supplier} onChange={event => { setSupplier(event.target.value); search('', false); }} required>
            <option value="">Select a supplier</option>{suppliers.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {!suppliers.length && <p className="muted">No active suppliers are available.</p>}
        <div className="purchase-rate-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
          <label className="filter-label">Search products by name or SKU
            <span className="search-input"><Search size={17} aria-hidden/><input ref={input} role="combobox" aria-autocomplete="list"
              aria-expanded={showResults} aria-controls={listId} aria-activedescendant={activeId} autoComplete="off" maxLength={80}
              disabled={!supplier || lines.length >= maxLines} value={term} placeholder="Enter a product name or SKU"
              onFocus={() => setOpen(true)} onChange={event => search(event.target.value, true)} onKeyDown={keys}/></span>
          </label>
          <div className="purchase-suggestions" hidden={!showResults}>
            {loading && <p role="status">Searching products…</p>}
            {searchError && <p role="alert">{searchError}</p>}
            {!loading && !searchError && !visible.length && <p role="status">No matching variants to add.</p>}
            <ul role="listbox" aria-label="Matching variants" id={listId}>
              {visible.map((option, index) => <li key={option.id} id={listId + '-' + option.id} role="option" aria-selected={index === active}
                onPointerDown={event => event.preventDefault()} onClick={() => add(option)}>
                <span><strong>{option.name}</strong> <code>{option.sku}</code></span>{option.cost && <small>last {option.cost}</small>}
              </li>)}
            </ul>
          </div>
        </div>
      </section>
      <section className="panel padded purchase-rate-lines" aria-label="Selected variants">
        <h2>Selected variants</h2>
        {lines.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Rates to save"><table>
          <thead><tr><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Unit cost</th><th scope="col">Discount</th><th scope="col">Tax</th><th scope="col">Remove</th></tr></thead>
          <tbody>{lines.map(line => <tr key={line.id}><td>{line.name}</td><td><code>{line.sku}</code></td>
            {(['cost', 'discount', 'tax'] as const).map(key => <td key={key}><input required inputMode="decimal" pattern="[0-9]{1,8}(\.[0-9]{1,2})?"
              aria-label={(key === 'cost' ? 'Unit cost' : key === 'discount' ? 'Discount' : 'Tax') + ' for ' + line.sku}
              value={line[key]} onChange={event => setLines(previous => previous.map(item => item.id === line.id ? { ...item, [key]: event.target.value } : item))}/></td>)}
            <td><button type="button" className="icon-button" aria-label={'Remove ' + line.sku} onClick={() => setLines(previous => previous.filter(item => item.id !== line.id))}><Trash2 size={15}/></button></td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">Search for products to add their variants here.</p>}
      </section>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="notice warn purchase-error" role="alert">{error}</p>}
      <div className="purchase-form-actions"><button className="button primary" disabled={!supplier || !lines.length || saving}>
        {saving ? 'Saving rates…' : 'Create Default Purchase'}
      </button></div>
    </fieldset>
  </form>;
}
